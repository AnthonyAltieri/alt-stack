use http_client_rust_tokio::{ApiClient, ApiClientOptions, ApiResponse, JsonRequest};
use httpmock::{Method::DELETE, Method::GET, Method::POST, MockServer};
use reqwest::header::{HeaderMap, HeaderValue};
use serde::{Deserialize, Serialize};

#[derive(Debug, Deserialize, Serialize, PartialEq)]
struct User {
    id: String,
    name: String,
}

#[derive(Debug, Deserialize, Serialize, PartialEq)]
struct ApiError {
    code: String,
    message: String,
}

#[derive(Debug, Serialize)]
struct CreateUserRequest<'a> {
    name: &'a str,
    email: &'a str,
}

#[derive(Debug, Serialize)]
struct UsersQuery {
    limit: u32,
}

#[tokio::test]
async fn interpolates_path_and_query_parameters() {
    let server = MockServer::start();
    let user = User {
        id: "123".into(),
        name: "Taylor".into(),
    };

    let mock = server.mock(|when, then| {
        when.method(GET)
            .path("/users/123")
            .query_param("limit", "10");
        then.status(200).json_body_obj(&user);
    });

    let client = ApiClient::new(ApiClientOptions::new(server.base_url()));
    let request = JsonRequest::new()
        .with_path_param("id", "123")
        .with_query(&UsersQuery { limit: 10 })
        .expect("query should serialize");

    let response = client
        .get::<User, ApiError>("/users/{id}", request)
        .await
        .expect("request should succeed");

    mock.assert();
    match response {
        ApiResponse::Success(success) => {
            assert_eq!(success.status, 200);
            assert_eq!(success.body, user);
        }
        ApiResponse::Error(_) => panic!("expected success response"),
    }
}

#[tokio::test]
async fn sends_json_body_and_merged_headers() {
    let server = MockServer::start();
    let user = User {
        id: "abc".into(),
        name: "Taylor".into(),
    };

    let mock = server.mock(|when, then| {
        when.method(POST)
            .path("/users")
            .header("authorization", "Bearer shared-token")
            .header("x-trace-id", "trace-123")
            .json_body_obj(&serde_json::json!({
                "name": "Taylor",
                "email": "taylor@example.com"
            }));
        then.status(201).json_body_obj(&user);
    });

    let mut default_headers = HeaderMap::new();
    default_headers.insert(
        "authorization",
        HeaderValue::from_static("Bearer shared-token"),
    );

    let client = ApiClient::new(ApiClientOptions {
        base_url: server.base_url(),
        headers: default_headers,
        timeout: None,
    });

    let mut request_headers = HeaderMap::new();
    request_headers.insert("x-trace-id", HeaderValue::from_static("trace-123"));

    let request = JsonRequest::new()
        .with_headers(request_headers)
        .with_body(&CreateUserRequest {
            name: "Taylor",
            email: "taylor@example.com",
        })
        .expect("body should serialize");

    let response = client
        .post::<User, ApiError>("/users", request)
        .await
        .expect("request should succeed");

    mock.assert();
    match response {
        ApiResponse::Success(success) => assert_eq!(success.status, 201),
        ApiResponse::Error(_) => panic!("expected success response"),
    }
}

#[tokio::test]
async fn returns_typed_error_response_for_non_2xx_status() {
    let server = MockServer::start();
    let error = ApiError {
        code: "NOT_FOUND".into(),
        message: "missing".into(),
    };

    let mock = server.mock(|when, then| {
        when.method(GET).path("/users/missing");
        then.status(404).json_body_obj(&error);
    });

    let client = ApiClient::new(ApiClientOptions::new(server.base_url()));
    let request = JsonRequest::new().with_path_param("id", "missing");

    let response = client
        .get::<User, ApiError>("/users/{id}", request)
        .await
        .expect("request should succeed");

    mock.assert();
    match response {
        ApiResponse::Error(error_response) => {
            assert_eq!(error_response.status, 404);
            assert_eq!(error_response.body, error);
        }
        ApiResponse::Success(_) => panic!("expected error response"),
    }
}

#[tokio::test]
async fn supports_delete_requests_without_body() {
    let server = MockServer::start();

    let mock = server.mock(|when, then| {
        when.method(DELETE).path("/users/123");
        then.status(200)
            .json_body_obj(&serde_json::json!({ "id": "123", "name": "Taylor" }));
    });

    let client = ApiClient::new(ApiClientOptions::new(server.base_url()));
    let request = JsonRequest::new().with_path_param("id", "123");

    let response = client
        .delete::<User, ApiError>("/users/{id}", request)
        .await
        .expect("request should succeed");

    mock.assert();
    assert!(response.is_success());
}

#[tokio::test]
async fn treats_empty_204_responses_as_success() {
    let server = MockServer::start();

    let mock = server.mock(|when, then| {
        when.method(DELETE).path("/users/123");
        then.status(204).header("content-length", "0").body("");
    });

    let client = ApiClient::new(ApiClientOptions::new(server.base_url()));
    let request = JsonRequest::new().with_path_param("id", "123");

    let response = client
        .delete::<(), ApiError>("/users/{id}", request)
        .await
        .expect("request should succeed");

    mock.assert();
    match response {
        ApiResponse::Success(success) => {
            assert_eq!(success.status, 204);
            assert_eq!(success.body, ());
        }
        ApiResponse::Error(_) => panic!("expected success response"),
    }
}
