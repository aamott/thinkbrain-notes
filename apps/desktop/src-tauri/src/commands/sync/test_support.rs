use std::fs;
use std::path::{Path, PathBuf};

use crate::commands::sync::bootstrap::bootstrap;
use crate::commands::sync::engine::Engine;
use crate::commands::sync::hidden_repo;
use crate::tests::make_temp_test_dir;

/// A vault and engine initialized with the same managed workspace setup as the
/// application uses.
pub(super) struct EngineFixture {
    pub(super) vault: PathBuf,
    pub(super) engine: Engine,
}

/// A vault paired with the hidden repository that records it.
pub(super) struct RepoFixture {
    pub(super) vault: PathBuf,
    pub(super) repo: gix::Repository,
}

/// Creates a managed vault and its recording engine for a sync test.
pub(super) fn engine_fixture(name: &str) -> EngineFixture {
    let app_data = make_temp_test_dir(&format!("{name}-appdata"), "sync", true);
    let vault = make_temp_test_dir(&format!("{name}-vault"), "sync", true);
    let workspace = bootstrap(&app_data, &vault).expect("bootstrap succeeds");
    EngineFixture {
        vault,
        engine: Engine::new(workspace.repo, workspace.has_own_git),
    }
}

/// Creates a vault and hidden repository using the requested test namespace.
pub(super) fn repo_fixture(name: &str, namespace: &str) -> RepoFixture {
    let vault = make_temp_test_dir(&format!("{name}-vault"), namespace, true);
    let git_dir = make_temp_test_dir(&format!("{name}-gitdir"), namespace, true);
    let repo = hidden_repo::open_or_create(&git_dir, &vault).expect("the hidden repository opens");
    RepoFixture { vault, repo }
}

/// Writes a test file, creating any folders needed by its relative path.
pub(super) fn write(root: &Path, relative: &str, contents: &str) {
    let path = root.join(relative);
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).expect("the folder exists");
    }
    fs::write(path, contents).expect("the file is written");
}
