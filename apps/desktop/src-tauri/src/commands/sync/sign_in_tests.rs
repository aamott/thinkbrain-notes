use super::*;
use crate::commands::sync::credentials::{get_legacy, get_profile, store};

#[test]
fn host_of_reads_an_https_host_and_ignores_userinfo() {
    assert_eq!(
        host_of(" https://github.com/you/notes.git "),
        Some("github.com".to_string())
    );
    assert_eq!(
        host_of("https://me:token@gitlab.example.test:8443/group/notes.git"),
        Some("gitlab.example.test:8443".to_string())
    );
    assert_eq!(host_of("/tmp/notes.git"), None);
}

#[test]
fn next_label_keeps_the_first_and_numbers_the_rest() {
    let existing = vec![SignInProfile {
        id: "a".to_string(),
        label: "me@github.com".to_string(),
        host: "github.com".to_string(),
        username: "me".to_string(),
    }];
    assert_eq!(next_label(&[], "me@github.com"), "me@github.com");
    assert_eq!(next_label(&existing, "me@github.com"), "me@github.com (2)");
    let mut both = existing;
    both.push(SignInProfile {
        id: "b".to_string(),
        label: "me@github.com (2)".to_string(),
        host: "github.com".to_string(),
        username: "me".to_string(),
    });
    assert_eq!(next_label(&both, "me@github.com"), "me@github.com (3)");
}

#[test]
fn creating_a_profile_does_not_overwrite_another_with_the_same_user() {
    let first = upsert_profile(
        "https://github.com/one/notes.git",
        "me",
        "token-one",
        None,
        None,
    )
    .expect("first profile");
    let second = upsert_profile(
        "https://github.com/two/notes.git",
        "me",
        "token-two",
        None,
        None,
    )
    .expect("second profile");

    assert_ne!(first.id, second.id);
    assert_ne!(first.label, second.label);
    assert_eq!(
        get_profile(&first.id).expect("readable"),
        Some(("me".to_string(), "token-one".to_string()))
    );
    assert_eq!(
        get_profile(&second.id).expect("readable"),
        Some(("me".to_string(), "token-two".to_string()))
    );
}

#[test]
fn updating_one_profile_leaves_the_other_token_alone() {
    let first = upsert_profile(
        "https://github.com/keep/notes.git",
        "me",
        "keep",
        None,
        None,
    )
    .expect("first");
    let second = upsert_profile(
        "https://github.com/change/notes.git",
        "me",
        "old",
        None,
        None,
    )
    .expect("second");

    upsert_profile(
        "https://github.com/change/notes.git",
        "me",
        "new",
        Some(second.id.clone()),
        None,
    )
    .expect("updated");

    assert_eq!(
        get_profile(&first.id).expect("readable"),
        Some(("me".to_string(), "keep".to_string()))
    );
    assert_eq!(
        get_profile(&second.id).expect("readable"),
        Some(("me".to_string(), "new".to_string()))
    );
}

#[test]
fn a_profile_cannot_be_moved_to_another_host() {
    let profile = upsert_profile(
        "https://github.com/me/notes.git",
        "me",
        "github-token",
        None,
        None,
    )
    .expect("profile");
    let error = upsert_profile(
        "https://gitlab.com/me/notes.git",
        "me",
        "gitlab-token",
        Some(profile.id.clone()),
        None,
    )
    .expect_err("host is immutable");

    assert_eq!(error.code, "sync.sign_in_wrong_host");
    assert_eq!(
        get_profile(&profile.id).expect("readable"),
        Some(("me".to_string(), "github-token".to_string()))
    );
    assert_eq!(
        require_saved_profile(&profile.id, "https://gitlab.com/me/notes.git")
            .expect_err("wrong host")
            .code,
        "sync.sign_in_wrong_host"
    );
}

#[test]
fn legacy_migration_copies_into_a_profile_and_keeps_the_url_entry() {
    let destination = "https://legacy.example.test/notes.git";
    store(destination, "old-me", "old-tok").expect("legacy stored");

    let profile = migrate_legacy(destination, "old-me", "old-tok").expect("migrated");

    assert_eq!(profile.username, "old-me");
    assert_eq!(profile.host, "legacy.example.test");
    assert_eq!(
        get_profile(&profile.id).expect("readable"),
        Some(("old-me".to_string(), "old-tok".to_string()))
    );
    assert_eq!(
        get_legacy(destination).expect("legacy still there"),
        Some(("old-me".to_string(), "old-tok".to_string()))
    );
}

#[test]
fn forgetting_a_profile_drops_its_secret_and_does_not_pick_another() {
    let keep = upsert_profile(
        "https://github.com/keep/notes.git",
        "keep",
        "keep-tok",
        None,
        None,
    )
    .expect("keep");
    let drop = upsert_profile(
        "https://github.com/drop/notes.git",
        "drop",
        "drop-tok",
        None,
        None,
    )
    .expect("drop");

    forget_sync_sign_in(drop.id.clone()).expect("forgotten");

    assert_eq!(get_profile(&drop.id).expect("readable"), None);
    assert_eq!(
        get_profile(&keep.id).expect("readable"),
        Some(("keep".to_string(), "keep-tok".to_string()))
    );
    assert!(load_catalog()
        .expect("catalog")
        .iter()
        .all(|profile| profile.id != drop.id));
}
