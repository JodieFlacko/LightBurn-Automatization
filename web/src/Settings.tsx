import { useEffect, useState } from "react";

type TemplateRule = {
  id: number;
  skuPattern: string;
  templateFilename: string;
  priority: number;
};

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3001";

interface SettingsProps {
  onBack: () => void;
}

export default function Settings({ onBack }: SettingsProps) {
  const [rules, setRules] = useState<TemplateRule[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [skuPattern, setSkuPattern] = useState("");
  const [templateFilename, setTemplateFilename] = useState("");
  const [priority, setPriority] = useState(0);

  const fetchRules = async () => {
    setLoading(true);
    try {
      const response = await fetch(`${API_URL}/settings/rules`);
      const data = await response.json();
      setRules(data.rules ?? []);
    } catch (error) {
      console.error("Failed to fetch rules:", error);
      setToast("Failed to load rules");
      setTimeout(() => setToast(null), 4000);
    } finally {
      setLoading(false);
    }
  };

  const handleAddRule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!skuPattern.trim() || !templateFilename.trim()) {
      setToast("Both SKU pattern and template filename are required");
      setTimeout(() => setToast(null), 4000);
      return;
    }

    setSaving(true);
    try {
      const response = await fetch(`${API_URL}/settings/rules`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          skuPattern: skuPattern.trim(),
          templateFilename: templateFilename.trim(),
          priority
        })
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to create rule");
      }

      setToast("Rule added successfully");
      setTimeout(() => setToast(null), 4000);
      setSkuPattern("");
      setTemplateFilename("");
      setPriority(0);
      await fetchRules();
    } catch (error) {
      console.error("Failed to add rule:", error);
      setToast(error instanceof Error ? error.message : "Failed to add rule");
      setTimeout(() => setToast(null), 4000);
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteRule = async (id: number) => {
    if (!confirm("Are you sure you want to delete this rule?")) {
      return;
    }

    try {
      const response = await fetch(`${API_URL}/settings/rules/${id}`, {
        method: "DELETE"
      });

      if (!response.ok) {
        throw new Error("Failed to delete rule");
      }

      setToast("Rule deleted successfully");
      setTimeout(() => setToast(null), 4000);
      await fetchRules();
    } catch (error) {
      console.error("Failed to delete rule:", error);
      setToast("Failed to delete rule");
      setTimeout(() => setToast(null), 4000);
    }
  };

  useEffect(() => {
    fetchRules();
  }, []);

  return (
    <div className="min-h-screen px-6 py-10">
      <div className="mx-auto max-w-5xl space-y-6">
        <header className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold">Template Rules Settings</h1>
            <p className="text-sm text-slate-600">
              Configure which template to use based on SKU patterns.
            </p>
          </div>
          <button
            className="rounded bg-slate-600 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700"
            onClick={onBack}
          >
            Back to Orders
          </button>
        </header>

        {toast && (
          <div className="rounded border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
            {toast}
          </div>
        )}

        {/* Add New Rule Form */}
        <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-lg font-semibold text-slate-800">Add New Rule</h2>
          <form onSubmit={handleAddRule} className="space-y-4">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  SKU Pattern
                </label>
                <input
                  type="text"
                  className="w-full rounded border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  placeholder="e.g., MUG- or PEN"
                  value={skuPattern}
                  onChange={(e) => setSkuPattern(e.target.value)}
                  disabled={saving}
                />
                <p className="mt-1 text-xs text-slate-500">
                  Matches if SKU contains this text
                </p>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  Template Filename
                </label>
                <input
                  type="text"
                  className="w-full rounded border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  placeholder="e.g., mug.lbrn2"
                  value={templateFilename}
                  onChange={(e) => setTemplateFilename(e.target.value)}
                  disabled={saving}
                />
                <p className="mt-1 text-xs text-slate-500">
                  Filename in templates/ folder
                </p>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  Priority
                </label>
                <input
                  type="number"
                  className="w-full rounded border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  placeholder="0"
                  value={priority}
                  onChange={(e) => setPriority(parseInt(e.target.value) || 0)}
                  disabled={saving}
                />
                <p className="mt-1 text-xs text-slate-500">
                  Higher = higher priority
                </p>
              </div>
            </div>
            <button
              type="submit"
              className="rounded bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-60"
              disabled={saving}
            >
              {saving ? "Adding..." : "Add Rule"}
            </button>
          </form>
        </section>

        {/* Rules List */}
        <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 px-4 py-3">
            <h2 className="text-sm font-medium text-slate-700">Existing Rules</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-100 text-left text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3">SKU Pattern</th>
                  <th className="px-4 py-3">Template Filename</th>
                  <th className="px-4 py-3">Priority</th>
                  <th className="px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loading ? (
                  <tr>
                    <td className="px-4 py-4 text-center text-slate-500" colSpan={4}>
                      Loading...
                    </td>
                  </tr>
                ) : rules.length === 0 ? (
                  <tr>
                    <td className="px-4 py-4 text-center text-slate-500" colSpan={4}>
                      No rules configured. Add a rule above to get started.
                    </td>
                  </tr>
                ) : (
                  rules.map((rule) => (
                    <tr key={rule.id}>
                      <td className="px-4 py-3 font-medium text-slate-700">
                        {rule.skuPattern}
                      </td>
                      <td className="px-4 py-3 text-slate-600">
                        {rule.templateFilename}
                      </td>
                      <td className="px-4 py-3 text-slate-600">{rule.priority}</td>
                      <td className="px-4 py-3">
                        <button
                          className="rounded bg-red-600 px-3 py-1 text-xs font-medium text-white hover:bg-red-700"
                          onClick={() => handleDeleteRule(rule.id)}
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
}
