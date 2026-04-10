use std::time::Duration;

use reqwest::{
    header::{HeaderMap, HeaderValue, CONTENT_TYPE},
    Client, Method,
};
use serde::{de::DeserializeOwned, Serialize};
use serde_json::Value;
use thiserror::Error;

#[derive(Debug, Clone)]
pub struct ApiClientOptions {
    pub base_url: String,
    pub headers: HeaderMap,
    pub timeout: Option<Duration>,
}

impl ApiClientOptions {
    pub fn new(base_url: impl Into<String>) -> Self {
        Self {
            base_url: normalize_base_url(base_url.into()),
            headers: HeaderMap::new(),
            timeout: None,
        }
    }
}

#[derive(Debug, Clone)]
pub struct ApiClient {
    http: Client,
    base_url: String,
    headers: HeaderMap,
    timeout: Option<Duration>,
}

impl ApiClient {
    pub fn new(options: ApiClientOptions) -> Self {
        Self {
            http: Client::new(),
            base_url: normalize_base_url(options.base_url),
            headers: options.headers,
            timeout: options.timeout,
        }
    }

    pub async fn get<TSuccess, TError>(
        &self,
        path: &str,
        request: JsonRequest,
    ) -> Result<ApiResponse<TSuccess, TError>, ApiClientError>
    where
        TSuccess: DeserializeOwned,
        TError: DeserializeOwned,
    {
        self.execute_json(Method::GET, path, request).await
    }

    pub async fn post<TSuccess, TError>(
        &self,
        path: &str,
        request: JsonRequest,
    ) -> Result<ApiResponse<TSuccess, TError>, ApiClientError>
    where
        TSuccess: DeserializeOwned,
        TError: DeserializeOwned,
    {
        self.execute_json(Method::POST, path, request).await
    }

    pub async fn put<TSuccess, TError>(
        &self,
        path: &str,
        request: JsonRequest,
    ) -> Result<ApiResponse<TSuccess, TError>, ApiClientError>
    where
        TSuccess: DeserializeOwned,
        TError: DeserializeOwned,
    {
        self.execute_json(Method::PUT, path, request).await
    }

    pub async fn patch<TSuccess, TError>(
        &self,
        path: &str,
        request: JsonRequest,
    ) -> Result<ApiResponse<TSuccess, TError>, ApiClientError>
    where
        TSuccess: DeserializeOwned,
        TError: DeserializeOwned,
    {
        self.execute_json(Method::PATCH, path, request).await
    }

    pub async fn delete<TSuccess, TError>(
        &self,
        path: &str,
        request: JsonRequest,
    ) -> Result<ApiResponse<TSuccess, TError>, ApiClientError>
    where
        TSuccess: DeserializeOwned,
        TError: DeserializeOwned,
    {
        self.execute_json(Method::DELETE, path, request).await
    }

    pub async fn execute_json<TSuccess, TError>(
        &self,
        method: Method,
        path: &str,
        request: JsonRequest,
    ) -> Result<ApiResponse<TSuccess, TError>, ApiClientError>
    where
        TSuccess: DeserializeOwned,
        TError: DeserializeOwned,
    {
        let interpolated_path = interpolate_path(path, &request.path_params);
        let url = format!("{}{}", self.base_url, interpolated_path);

        let mut headers = self.headers.clone();
        for (name, value) in &request.headers {
            headers.insert(name, value.clone());
        }
        if request.body.is_some() && !headers.contains_key(CONTENT_TYPE) {
            headers.insert(CONTENT_TYPE, HeaderValue::from_static("application/json"));
        }

        let mut builder = self.http.request(method, url).headers(headers);
        if let Some(timeout) = request.timeout.or(self.timeout) {
            builder = builder.timeout(timeout);
        }

        if let Some(query) = request.query.as_ref() {
            let pairs = build_query_pairs(query);
            if !pairs.is_empty() {
                builder = builder.query(&pairs);
            }
        }

        if let Some(body) = request.body.as_ref() {
            builder = builder.json(body);
        }

        let response = builder.send().await?;
        let status = response.status().as_u16();
        let headers = response.headers().clone();
        let body_text = response.text().await?;

        if (200..300).contains(&status) {
            let body = deserialize_body::<TSuccess>(&body_text, status, "success")?;
            return Ok(ApiResponse::Success(JsonResponse {
                status,
                headers,
                body,
            }));
        }

        let body = deserialize_body::<TError>(&body_text, status, "error")?;
        Ok(ApiResponse::Error(JsonResponse {
            status,
            headers,
            body,
        }))
    }
}

#[derive(Debug, Clone, Default)]
pub struct JsonRequest {
    pub path_params: Vec<(String, String)>,
    pub query: Option<Value>,
    pub body: Option<Value>,
    pub headers: HeaderMap,
    pub timeout: Option<Duration>,
}

impl JsonRequest {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn with_path_param(mut self, key: impl Into<String>, value: impl Into<String>) -> Self {
        self.path_params.push((key.into(), value.into()));
        self
    }

    pub fn with_query<T>(mut self, query: &T) -> Result<Self, ApiClientError>
    where
        T: Serialize + ?Sized,
    {
        self.query =
            Some(
                serde_json::to_value(query).map_err(|source| ApiClientError::Serialize {
                    kind: "query",
                    source,
                })?,
            );
        Ok(self)
    }

    pub fn with_body<T>(mut self, body: &T) -> Result<Self, ApiClientError>
    where
        T: Serialize + ?Sized,
    {
        self.body =
            Some(
                serde_json::to_value(body).map_err(|source| ApiClientError::Serialize {
                    kind: "body",
                    source,
                })?,
            );
        Ok(self)
    }

    pub fn with_headers(mut self, headers: HeaderMap) -> Self {
        self.headers = headers;
        self
    }

    pub fn with_timeout(mut self, timeout: Duration) -> Self {
        self.timeout = Some(timeout);
        self
    }
}

#[derive(Debug, Clone)]
pub struct JsonResponse<T> {
    pub status: u16,
    pub headers: HeaderMap,
    pub body: T,
}

#[derive(Debug, Clone)]
pub enum ApiResponse<TSuccess, TError> {
    Success(JsonResponse<TSuccess>),
    Error(JsonResponse<TError>),
}

impl<TSuccess, TError> ApiResponse<TSuccess, TError> {
    pub fn is_success(&self) -> bool {
        matches!(self, Self::Success(_))
    }

    pub fn status(&self) -> u16 {
        match self {
            Self::Success(response) => response.status,
            Self::Error(response) => response.status,
        }
    }
}

#[derive(Debug, Error)]
pub enum ApiClientError {
    #[error("failed to serialize {kind} payload: {source}")]
    Serialize {
        kind: &'static str,
        source: serde_json::Error,
    },
    #[error("request failed: {0}")]
    Request(#[from] reqwest::Error),
    #[error("failed to deserialize {kind} response for status {status}: {source}; body: {body}")]
    Deserialize {
        kind: &'static str,
        status: u16,
        source: serde_json::Error,
        body: String,
    },
}

fn normalize_base_url(base_url: String) -> String {
    base_url.trim_end_matches('/').to_owned()
}

fn interpolate_path(path: &str, params: &[(String, String)]) -> String {
    let mut rendered = path.to_owned();
    for (key, value) in params {
        rendered = rendered.replace(&format!("{{{key}}}"), value);
    }
    rendered
}

fn build_query_pairs(value: &Value) -> Vec<(String, String)> {
    let mut pairs = Vec::new();
    if let Value::Object(map) = value {
        for (key, value) in map {
            append_query_value(&mut pairs, key.clone(), value);
        }
    }
    pairs
}

fn append_query_value(pairs: &mut Vec<(String, String)>, key: String, value: &Value) {
    match value {
        Value::Null => {}
        Value::Bool(boolean) => pairs.push((key, boolean.to_string())),
        Value::Number(number) => pairs.push((key, number.to_string())),
        Value::String(string) => pairs.push((key, string.clone())),
        Value::Array(items) => {
            for item in items {
                append_query_value(pairs, key.clone(), item);
            }
        }
        Value::Object(_) => pairs.push((key, value.to_string())),
    }
}

fn deserialize_body<T>(body: &str, status: u16, kind: &'static str) -> Result<T, ApiClientError>
where
    T: DeserializeOwned,
{
    serde_json::from_str(body).map_err(|source| ApiClientError::Deserialize {
        kind,
        status,
        source,
        body: body.to_owned(),
    })
}

pub use reqwest::{header::HeaderMap as DefaultHeaderMap, Method as HttpMethod};
