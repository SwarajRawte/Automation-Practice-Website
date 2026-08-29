import { useEffect, useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { getSessionUser, readCachedUser } from "./authClient";

type ProfileTab = "Profile" | "Security" | "Preferences" | "Notifications";

type Preferences = {
  language: "English" | "French";
  timezone: "America/Toronto" | "UTC";
  notifications: boolean;
};

const defaults: Preferences = {
  language: "English",
  timezone: "America/Toronto",
  notifications: true,
};

function tabFromSearch(search: string): ProfileTab {
  const tab = new URLSearchParams(search).get("tab")?.toLowerCase();
  if (tab === "security") return "Security";
  if (tab === "preferences") return "Preferences";
  if (tab === "notifications") return "Notifications";
  return "Profile";
}

function readPreferences(key: string): Preferences {
  try {
    const parsed = JSON.parse(localStorage.getItem(key) ?? "{}");
    return {
      language: parsed.language === "French" ? "French" : "English",
      timezone: parsed.timezone === "UTC" ? "UTC" : "America/Toronto",
      notifications: parsed.notifications !== false,
    };
  } catch {
    return defaults;
  }
}

export default function Profile() {
  const location = useLocation();
  const user = getSessionUser() || readCachedUser();
  const preferenceKey = `e2e-test-lab:preferences:v1:user:${encodeURIComponent(
    String(user?.id ?? "anonymous"),
  )}`;
  const [tab, setTab] = useState<ProfileTab>(() =>
    tabFromSearch(location.search),
  );
  const [preferences, setPreferences] = useState<Preferences>(() =>
    readPreferences(preferenceKey),
  );
  const [saved, setSaved] = useState("");

  useEffect(() => {
    setTab(tabFromSearch(location.search));
    setSaved("");
  }, [location.search]);

  const save = () => {
    try {
      localStorage.setItem(preferenceKey, JSON.stringify(preferences));
      setSaved("Settings saved successfully.");
    } catch {
      setSaved("Settings could not be saved in this browser.");
    }
  };

  const cancel = () => {
    setPreferences(readPreferences(preferenceKey));
    setSaved("Unsaved changes discarded.");
  };

  return (
    <div className="settings-page">
      <header className="settings-header">
        <span className="avatar avatar--lg">
          {user?.name
            ?.split(" ")
            .map((part) => part[0])
            .slice(0, 2)
            .join("")}
        </span>
        <div>
          <h1>{user?.name}</h1>
          <p>
            {user?.email} · {user?.role}
          </p>
        </div>
      </header>

      <nav className="settings-tabs" aria-label="Profile sections">
        {(["Profile", "Security", "Preferences", "Notifications"] as const).map(
          (value) => (
            <button
              aria-current={tab === value ? "page" : undefined}
              onClick={() => {
                setTab(value);
                setSaved("");
              }}
              key={value}
            >
              {value}
            </button>
          ),
        )}
      </nav>

      <section className="settings-panel">
        <h2>{tab}</h2>
        <p>
          Manage your {tab.toLowerCase()} settings for this local test
          environment.
        </p>
        {tab === "Profile" && (
          <div className="form grid">
            <label>
              Display name
              <input value={user?.name ?? ""} readOnly />
            </label>
            <label>
              Email address
              <input type="email" value={user?.email ?? ""} readOnly />
            </label>
            <label>
              Role
              <input value={user?.role ?? ""} readOnly />
            </label>
            <p className="field-help">
              Account identity is managed by the authentication API.
            </p>
          </div>
        )}
        {tab === "Security" && (
          <div className="panel">
            <p>
              Change your password through the protected account workflow. All
              active sessions are revoked after a successful change.
            </p>
            <NavLink className="btn btn--primary" to="/auth/change-password">
              Change password
            </NavLink>
          </div>
        )}
        {tab === "Preferences" && (
          <div className="form grid">
            <label>
              Language
              <select
                value={preferences.language}
                onChange={(event) =>
                  setPreferences((current) => ({
                    ...current,
                    language: event.target.value as Preferences["language"],
                  }))
                }
              >
                <option>English</option>
                <option>French</option>
              </select>
            </label>
            <label>
              Timezone
              <select
                value={preferences.timezone}
                onChange={(event) =>
                  setPreferences((current) => ({
                    ...current,
                    timezone: event.target.value as Preferences["timezone"],
                  }))
                }
              >
                <option>America/Toronto</option>
                <option>UTC</option>
              </select>
            </label>
          </div>
        )}
        {tab === "Notifications" && (
          <label className="check">
            <input
              type="checkbox"
              checked={preferences.notifications}
              onChange={(event) =>
                setPreferences((current) => ({
                  ...current,
                  notifications: event.target.checked,
                }))
              }
            />
            Enable lab notifications
          </label>
        )}
        {(tab === "Preferences" || tab === "Notifications") && (
          <div className="actions">
            <button className="btn btn--primary" onClick={save}>
              Save changes
            </button>
            <button className="btn btn--outline" onClick={cancel}>
              Cancel
            </button>
          </div>
        )}
        <output role="status">{saved}</output>
      </section>
    </div>
  );
}
