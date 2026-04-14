mod dependencies;
mod generator;
mod registry;
mod roundtrip;
mod routes;

pub use dependencies::{extract_schema_dependencies, topological_sort_schemas};
pub use generator::{convert_schema_to_rust_type, openapi_to_rust_code, GenerationOptions};
pub use registry::{
    clear_rust_schema_registry, register_rust_type_to_openapi_schema, schema_registry,
    RustOpenApiRegistration, SUPPORTED_STRING_FORMATS,
};
pub use roundtrip::{rust_code_to_openapi, RustCodeToOpenApiError};
pub use routes::{
    build_route_schema_name, generate_route_module_name, generate_route_schema_names,
    parse_openapi_paths, HttpMethod, RouteInfo, RouteParameter, RouteSchemaNames,
};
