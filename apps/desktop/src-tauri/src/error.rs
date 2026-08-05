use serde::Serialize;

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

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ErrorCode {
    GitNotInstalled,
    GitCommandTimeout,
    GitCommandFailed,
    WorkspaceInvalidPath,
    WorkspaceReadFailed,
    WorkspaceFileMissing,
    WorkspaceWriteFailed,
    WorkspaceFileExists,
    WorkspaceCreateParentFailed,
    WorkspaceCreateFailed,
    WorkspaceRenameFailed,
    WorkspaceDeleteFailed,
    WorkspaceNotMarkdown,
    WorkspaceListFailed,
    WorkspaceMetadataFailed,
    IndexWriteFailed,
    IndexSearchFailed,
    IndexClearFailed,
    IndexRemoveFailed,
    IndexOpenFailed,
    IndexSchemaFailed,
    IndexAppDataUnavailable,
    IndexCreateDirFailed,
    SettingsAppDataUnavailable,
    SettingsSerializeFailed,
    SettingsReadFailed,
    SettingsInvalidPath,
    SettingsCreateDirFailed,
    SettingsWriteFailed,
    DesktopTestFailure,
}

impl ErrorCode {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::GitNotInstalled => "git.not_installed",
            Self::GitCommandTimeout => "git.command_timeout",
            Self::GitCommandFailed => "git.command_failed",
            Self::WorkspaceInvalidPath => "workspace.invalid_path",
            Self::WorkspaceReadFailed => "workspace.read_failed",
            Self::WorkspaceFileMissing => "workspace.file_missing",
            Self::WorkspaceWriteFailed => "workspace.write_failed",
            Self::WorkspaceFileExists => "workspace.file_exists",
            Self::WorkspaceCreateParentFailed => "workspace.create_parent_failed",
            Self::WorkspaceCreateFailed => "workspace.create_failed",
            Self::WorkspaceRenameFailed => "workspace.rename_failed",
            Self::WorkspaceDeleteFailed => "workspace.delete_failed",
            Self::WorkspaceNotMarkdown => "workspace.not_markdown",
            Self::WorkspaceListFailed => "workspace.list_failed",
            Self::WorkspaceMetadataFailed => "workspace.metadata_failed",
            Self::IndexWriteFailed => "index.write_failed",
            Self::IndexSearchFailed => "index.search_failed",
            Self::IndexClearFailed => "index.clear_failed",
            Self::IndexRemoveFailed => "index.remove_failed",
            Self::IndexOpenFailed => "index.open_failed",
            Self::IndexSchemaFailed => "index.schema_failed",
            Self::IndexAppDataUnavailable => "index.app_data_unavailable",
            Self::IndexCreateDirFailed => "index.create_dir_failed",
            Self::SettingsAppDataUnavailable => "settings.app_data_unavailable",
            Self::SettingsSerializeFailed => "settings.serialize_failed",
            Self::SettingsReadFailed => "settings.read_failed",
            Self::SettingsInvalidPath => "settings.invalid_path",
            Self::SettingsCreateDirFailed => "settings.create_dir_failed",
            Self::SettingsWriteFailed => "settings.write_failed",
            Self::DesktopTestFailure => "desktop.test_failure",
        }
    }
}

impl From<ErrorCode> for String {
    fn from(val: ErrorCode) -> Self {
        val.as_str().to_string()
    }
}



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
        details: impl Into<String>,
    ) -> Self {
        Self {
            code: code.into(),
            message: message.into(),
            details: Some(details.into()),
        }
    }
}


