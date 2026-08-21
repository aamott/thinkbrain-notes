use serde::Serialize;
use std::sync::{Mutex, MutexGuard};

/// Recovers a mutex guard after poison, preserving the previous behavior of
/// every inline `.lock().unwrap_or_else(|e| e.into_inner())` in the codebase.
pub fn lock_or_recover<T>(mutex: &Mutex<T>) -> MutexGuard<'_, T> {
    mutex.lock().unwrap_or_else(|error| error.into_inner())
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct NativeError {
    pub code: String,
    pub message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub details: Option<String>,
}

impl std::fmt::Display for NativeError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        if let Some(details) = &self.details {
            write!(f, "[{}] {}: {}", self.code, self.message, details)
        } else {
            write!(f, "[{}] {}", self.code, self.message)
        }
    }
}

impl std::error::Error for NativeError {}

impl NativeError {
    pub fn new(code: impl Into<String>, message: impl Into<String>) -> Self {
        Self {
            code: code.into(),
            message: message.into(),
            details: None,
        }
    }

    pub fn with_details(
        code: impl Into<String>,
        message: impl Into<String>,
        details: impl std::fmt::Display,
    ) -> Self {
        Self {
            code: code.into(),
            message: message.into(),
            details: Some(details.to_string()),
        }
    }
}
