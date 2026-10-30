"use client";
import { useEffect, useState } from "react";
import { Leaf, Check, Heart } from "lucide-react";
import { api, ErrorBox, Spinner, splitList } from "./shared";
import type { Preferences as Pref } from "./types";
export default function Preferences() {
  const [p, setP] = useState<Pref>({
      dietary_preferences: [],
      preferred_cuisines: [],
      spice_level: "Medium",
      allergens: [],
    }),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [saved, setSaved] = useState(false),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    api<{ preferences: Pref | null }>("preferences")
      .then((r) => {
        if (r.preferences) setP(r.preferences);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);
  if (loading) return <Spinner />;
  return (
    <div className="page-container narrow">
      <div className="page-heading">
        <span className="eyebrow">JUST THE WAY YOU LIKE IT</span>
        <h1>
          A kitchen that <em>knows you.</em>
        </h1>
        <p>Tell us what makes your perfect plate.</p>
      </div>
      <section className="panel">
        <div className="panel-title">
          <Leaf size={25} />
          <h2>Your food preferences</h2>
        </div>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError("");
            setSaved(false);
            try {
              await api("preferences", "PUT", {
                dietary_preferences: p.dietary_preferences,
                preferred_cuisines: p.preferred_cuisines,
                spice_level: p.spice_level,
                allergens: p.allergens,
              });
              setSaved(true);
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <label className="field">
            Dietary preferences
            <input
              defaultValue={p.dietary_preferences.join(", ")}
              placeholder="Vegetarian, dairy-free…"
              onChange={(e) =>
                setP({ ...p, dietary_preferences: splitList(e.target.value) })
              }
            />
            <small>Separate each preference with a comma.</small>
          </label>
          <label className="field">
            Favourite cuisines
            <input
              defaultValue={p.preferred_cuisines.join(", ")}
              placeholder="Indian, Italian…"
              onChange={(e) =>
                setP({ ...p, preferred_cuisines: splitList(e.target.value) })
              }
            />
          </label>
          <label className="field">
            Your spice level
            <select
              value={p.spice_level}
              onChange={(e) => setP({ ...p, spice_level: e.target.value })}
            >
              <option>Mild</option>
              <option>Medium</option>
              <option>High</option>
            </select>
          </label>
          <label className="field">
            Allergens to be aware of
            <input
              defaultValue={p.allergens.join(", ")}
              placeholder="Peanuts, shellfish…"
              onChange={(e) =>
                setP({ ...p, allergens: splitList(e.target.value) })
              }
            />
          </label>
          <div className="info-box">
            <Heart size={19} />
            <p>
              Preferences help us understand you. Always tell the team directly
              about serious allergies before ordering.
            </p>
          </div>
          <ErrorBox error={error} />
          {saved && (
            <div className="success-box" role="status">
              <Check size={18} />
              Your preferences have been saved.
            </div>
          )}
          <button className="button primary full" disabled={busy}>
            {busy ? "Saving…" : "Save my preferences"}
            <Check size={17} />
          </button>
        </form>
      </section>
    </div>
  );
}
