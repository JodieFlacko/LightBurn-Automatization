import { useEffect, useState } from "react";

type TemplateRule = {
  id: number;
  skuPattern: string;
  templateFilename: string;
  priority: number;
};

type AssetRule = {
  id: number;
  triggerKeyword: string;
  assetType: 'image' | 'font' | 'color';
  value: string;
};

type Tab = 'templates' | 'assets';

// In production, use relative URLs (served from same origin)
// In development, use explicit localhost URL
const API_URL = import.meta.env.VITE_API_URL || 
  (import.meta.env.PROD ? "" : "http://localhost:3001");

interface SettingsProps {
  onBack: () => void;
  suggestedSku?: string | null;
}

export default function Settings({ onBack, suggestedSku }: SettingsProps) {
  const [activeTab, setActiveTab] = useState<Tab>('templates');
  const [rules, setRules] = useState<TemplateRule[]>([]);
  const [assetRules, setAssetRules] = useState<AssetRule[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [toastType, setToastType] = useState<'success' | 'error'>('success');
  const [skuPattern, setSkuPattern] = useState(suggestedSku || "");
  const [templateFilename, setTemplateFilename] = useState("");
  const [priority, setPriority] = useState(0);
  
  // Asset rule form state
  const [triggerKeyword, setTriggerKeyword] = useState("");
  const [assetType, setAssetType] = useState<'image' | 'font' | 'color'>('image');
  const [assetValue, setAssetValue] = useState("");

  // General config state
  const [feedUrl, setFeedUrl] = useState("");
  const [initialFeedUrl, setInitialFeedUrl] = useState("");
  const [templatesPath, setTemplatesPath] = useState("");
  const [initialTemplatesPath, setInitialTemplatesPath] = useState("");
  const [isLoadingConfig, setIsLoadingConfig] = useState(false);
  const [isSavingConfig, setIsSavingConfig] = useState(false);
  const [isTestingConnection, setIsTestingConnection] = useState(false);

  // Helper to show toast with type
  const showToast = (message: string, type: 'success' | 'error' = 'success', duration = 4000) => {
    setToast(message);
    setToastType(type);
    setTimeout(() => setToast(null), duration);
  };

  // Fetch general config on mount
  const fetchConfig = async () => {
    setIsLoadingConfig(true);
    try {
      const response = await fetch(`${API_URL}/config`);
      const data = await response.json();
      setFeedUrl(data.feedUrl || "");
      setInitialFeedUrl(data.feedUrl || "");
      // Null safety: if templatesPath is null/undefined, use empty string
      setTemplatesPath(data.templatesPath || "");
      setInitialTemplatesPath(data.templatesPath || "");
    } catch (error) {
      console.error("Failed to fetch config:", error);
      showToast("Failed to load configuration", 'error');
    } finally {
      setIsLoadingConfig(false);
    }
  };

  // Save feed URL and templates path configuration
  const handleSave = async () => {
    const trimmedUrl = feedUrl.trim();
    
    if (!trimmedUrl) {
      showToast("Feed URL cannot be empty", 'error');
      return;
    }

    setIsSavingConfig(true);
    try {
      const response = await fetch(`${API_URL}/config`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          feedUrl: trimmedUrl,
          templatesPath: templatesPath  // Send as-is (can be empty string)
        })
      });

      // Check status code FIRST before parsing
      if (response.status !== 200) {
        const errorData = await response.json();
        const msg = errorData.message || "Unknown error occurred";
        
        // Show red error toast for 10 seconds
        showToast("Failed to save: " + msg, 'error', 10000);
        
        // STOP: Do not show success message. Do not close form. Return early.
        setIsSavingConfig(false);
        return;
      }

      const data = await response.json();

      // Success path
      setInitialFeedUrl(trimmedUrl);
      setInitialTemplatesPath(templatesPath);
      showToast("Configuration saved successfully", 'success');
    } catch (error) {
      console.error("Failed to save config:", error);
      showToast(error instanceof Error ? error.message : "Failed to save configuration", 'error', 10000);
    } finally {
      setIsSavingConfig(false);
    }
  };

  // Test feed connection without saving
  const handleTestConnection = async () => {
    const trimmedUrl = feedUrl.trim();
    
    if (!trimmedUrl) {
      showToast("Feed URL cannot be empty", 'error');
      return;
    }

    setIsTestingConnection(true);
    try {
      const response = await fetch(`${API_URL}/config/test`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ feedUrl: trimmedUrl })
      });

      const data = await response.json();

      if (data.success) {
        showToast("✓ Connection successful! Feed is accessible.", 'success');
      } else {
        showToast(`✗ Connection failed: ${data.message}`, 'error');
      }
    } catch (error) {
      console.error("Failed to test connection:", error);
      showToast("✗ Connection test failed: Network error", 'error');
    } finally {
      setIsTestingConnection(false);
    }
  };

  const fetchRules = async () => {
    setLoading(true);
    try {
      const response = await fetch(`${API_URL}/settings/rules`);
      const data = await response.json();
      setRules(data.rules ?? []);
    } catch (error) {
      console.error("Failed to fetch rules:", error);
      showToast("Failed to load rules", 'error');
    } finally {
      setLoading(false);
    }
  };

  const fetchAssetRules = async () => {
    setLoading(true);
    try {
      const response = await fetch(`${API_URL}/settings/asset-rules`);
      const data = await response.json();
      setAssetRules(data.rules ?? []);
    } catch (error) {
      console.error("Failed to fetch asset rules:", error);
      showToast("Failed to load asset rules", 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleAddRule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!skuPattern.trim() || !templateFilename.trim()) {
      showToast("Both SKU pattern and template filename are required", 'error');
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

      showToast("Rule added successfully", 'success');
      setSkuPattern("");
      setTemplateFilename("");
      setPriority(0);
      await fetchRules();
    } catch (error) {
      console.error("Failed to add rule:", error);
      showToast(error instanceof Error ? error.message : "Failed to add rule", 'error');
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

      showToast("Rule deleted successfully", 'success');
      await fetchRules();
    } catch (error) {
      console.error("Failed to delete rule:", error);
      showToast("Failed to delete rule", 'error');
    }
  };

  const handleAddAssetRule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!triggerKeyword.trim() || !assetValue.trim()) {
      showToast("Both keyword and value are required", 'error');
      return;
    }

    setSaving(true);
    try {
      const response = await fetch(`${API_URL}/settings/asset-rules`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          triggerKeyword: triggerKeyword.trim(),
          assetType,
          value: assetValue.trim()
        })
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to create asset rule");
      }

      showToast("Asset rule added successfully", 'success');
      setTriggerKeyword("");
      setAssetValue("");
      await fetchAssetRules();
    } catch (error) {
      console.error("Failed to add asset rule:", error);
      showToast(error instanceof Error ? error.message : "Failed to add asset rule", 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteAssetRule = async (id: number) => {
    if (!confirm("Are you sure you want to delete this asset rule?")) {
      return;
    }

    try {
      const response = await fetch(`${API_URL}/settings/asset-rules/${id}`, {
        method: "DELETE"
      });

      if (!response.ok) {
        throw new Error("Failed to delete asset rule");
      }

      showToast("Asset rule deleted successfully", 'success');
      await fetchAssetRules();
    } catch (error) {
      console.error("Failed to delete asset rule:", error);
      showToast("Failed to delete asset rule", 'error');
    }
  };

  useEffect(() => {
    // Fetch general config on initial mount
    fetchConfig();
  }, []);

  useEffect(() => {
    if (activeTab === 'templates') {
      fetchRules();
    } else {
      fetchAssetRules();
    }
  }, [activeTab]);

  return (
    <div className="min-h-screen px-6 py-10">
      <div className="mx-auto max-w-5xl space-y-6">
        <header className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold">Settings</h1>
            <p className="text-sm text-slate-600">
              Configure templates and design assets.
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
          <div className={`rounded border px-4 py-3 text-sm ${
            toastType === 'success'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
              : 'border-red-200 bg-red-50 text-red-700'
          }`}>
            {toast}
          </div>
        )}

        {suggestedSku && (
          <div className="rounded-lg border border-orange-200 bg-orange-50 px-4 py-3">
            <div className="flex items-start gap-3">
              <svg className="h-5 w-5 text-orange-600 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
              <div className="flex-1">
                <h3 className="text-sm font-semibold text-orange-900 mb-1">
                  Configuration Required
                </h3>
                <p className="text-sm text-orange-800">
                  No template found for SKU '<span className="font-mono font-semibold">{suggestedSku}</span>'. 
                  Add a template rule below, then go back to orders and use "Reset & Retry" to process the order.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* General Configuration Section */}
        <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-lg font-semibold text-slate-800">General Configuration</h2>
          
          {isLoadingConfig ? (
            <div className="text-center py-4 text-slate-500">Loading configuration...</div>
          ) : (
            <div className="space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  Amazon Orders Feed URL / File Path
                </label>
                <input
                  type="text"
                  className="w-full rounded border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  placeholder="http://example.com/feed.xml or C:\Users\Name\feed.xml"
                  value={feedUrl}
                  onChange={(e) => setFeedUrl(e.target.value)}
                  disabled={isSavingConfig || isTestingConnection}
                />
                <p className="mt-1 text-xs text-slate-500">
                  Enter a web URL (http://...) or a local file path (C:\Users\...)
                </p>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  Templates Directory
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    className="flex-1 rounded border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    placeholder="e.g., C:\Users\peppe\Documents\Victoria Laser\templates"
                    value={templatesPath}
                    onChange={(e) => setTemplatesPath(e.target.value)}
                    disabled={isSavingConfig || isTestingConnection}
                  />
                  <button
                    type="button"
                    className="rounded border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
                    onClick={() => setTemplatesPath("")}
                    disabled={isSavingConfig || isTestingConnection}
                    title="Clear custom path and use auto-detected location"
                  >
                    Use Default
                  </button>
                </div>
                <p className="mt-1 text-xs text-slate-500">
                  Full path to your LightBurn templates folder. Leave empty to use default location.
                </p>
              </div>

              <div className="flex gap-3">
                <button
                  type="button"
                  className="rounded border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                  onClick={handleTestConnection}
                  disabled={feedUrl.trim() === '' || isTestingConnection || isSavingConfig}
                >
                  {isTestingConnection && (
                    <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                  )}
                  {isTestingConnection ? "Testing..." : "Test Connection"}
                </button>
                
                <button
                  type="button"
                  className="rounded bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                  onClick={handleSave}
                  disabled={(feedUrl.trim() === initialFeedUrl && templatesPath === initialTemplatesPath) || isSavingConfig || isTestingConnection}
                >
                  {isSavingConfig && (
                    <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                  )}
                  {isSavingConfig ? "Saving..." : "Save Configuration"}
                </button>
              </div>
            </div>
          )}
        </section>

        {/* Tabs */}
        <div className="flex gap-2 border-b border-slate-200">
          <button
            className={`px-4 py-2 text-sm font-medium transition-colors ${
              activeTab === 'templates'
                ? 'border-b-2 border-indigo-600 text-indigo-600'
                : 'text-slate-600 hover:text-slate-900'
            }`}
            onClick={() => setActiveTab('templates')}
          >
            Template Rules
          </button>
          <button
            className={`px-4 py-2 text-sm font-medium transition-colors ${
              activeTab === 'assets'
                ? 'border-b-2 border-indigo-600 text-indigo-600'
                : 'text-slate-600 hover:text-slate-900'
            }`}
            onClick={() => setActiveTab('assets')}
          >
            Design Assets
          </button>
        </div>

        {/* Template Rules Tab */}
        {activeTab === 'templates' && (
          <>
            {/* Add New Rule Form */}
            <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="mb-4 text-lg font-semibold text-slate-800">Add New Template Rule</h2>
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

        {/* Template Rules List */}
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
          </>
        )}

        {/* Design Assets Tab */}
        {activeTab === 'assets' && (
          <>
            {/* Add New Asset Rule Form */}
            <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="mb-4 text-lg font-semibold text-slate-800">Add New Asset Rule</h2>
              <form onSubmit={handleAddAssetRule} className="space-y-4">
                <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                  <div>
                    <label className="mb-1 block text-sm font-medium text-slate-700">
                      Trigger Keyword
                    </label>
                    <input
                      type="text"
                      className="w-full rounded border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                      placeholder="e.g., Skull or Red"
                      value={triggerKeyword}
                      onChange={(e) => setTriggerKeyword(e.target.value)}
                      disabled={saving}
                    />
                    <p className="mt-1 text-xs text-slate-500">
                      Keyword in Amazon custom field
                    </p>
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium text-slate-700">
                      Asset Type
                    </label>
                    <select
                      className="w-full rounded border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                      value={assetType}
                      onChange={(e) => setAssetType(e.target.value as 'image' | 'font' | 'color')}
                      disabled={saving}
                    >
                      <option value="image">Image</option>
                      <option value="font">Font</option>
                      <option value="color">Color</option>
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium text-slate-700">
                      Value
                    </label>
                    <input
                      type="text"
                      className="w-full rounded border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                      placeholder={
                        assetType === 'image' 
                          ? 'e.g., skull.png' 
                          : assetType === 'font' 
                          ? 'e.g., Arial,12,bold' 
                          : 'e.g., #ff0000'
                      }
                      value={assetValue}
                      onChange={(e) => setAssetValue(e.target.value)}
                      disabled={saving}
                    />
                    <p className="mt-1 text-xs text-slate-500">
                      {assetType === 'image' && 'Filename in assets/ folder'}
                      {assetType === 'font' && 'Font name'}
                      {assetType === 'color' && 'Hex color code'}
                    </p>
                  </div>
                </div>
                <button
                  type="submit"
                  className="rounded bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-60"
                  disabled={saving}
                >
                  {saving ? "Adding..." : "Add Asset Rule"}
                </button>
              </form>
            </section>

            {/* Asset Rules List */}
            <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
              <div className="border-b border-slate-200 px-4 py-3">
                <h2 className="text-sm font-medium text-slate-700">Existing Asset Rules</h2>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-200 text-sm">
                  <thead className="bg-slate-100 text-left text-xs uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-4 py-3">Trigger Keyword</th>
                      <th className="px-4 py-3">Asset Type</th>
                      <th className="px-4 py-3">Value</th>
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
                    ) : assetRules.length === 0 ? (
                      <tr>
                        <td className="px-4 py-4 text-center text-slate-500" colSpan={4}>
                          No asset rules configured. Add a rule above to get started.
                        </td>
                      </tr>
                    ) : (
                      assetRules.map((rule) => (
                        <tr key={rule.id}>
                          <td className="px-4 py-3 font-medium text-slate-700">
                            {rule.triggerKeyword}
                          </td>
                          <td className="px-4 py-3 text-slate-600">
                            <span className="inline-flex items-center rounded-md bg-indigo-50 px-2 py-1 text-xs font-medium text-indigo-700 ring-1 ring-inset ring-indigo-700/10">
                              {rule.assetType}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-slate-600">
                            {rule.assetType === 'color' ? (
                              <div className="flex items-center gap-2">
                                <div 
                                  className="h-6 w-6 rounded border-2 border-slate-300"
                                  style={{ backgroundColor: rule.value }}
                                />
                                <span>{rule.value}</span>
                              </div>
                            ) : (
                              rule.value
                            )}
                          </td>
                          <td className="px-4 py-3">
                            <button
                              className="rounded bg-red-600 px-3 py-1 text-xs font-medium text-white hover:bg-red-700"
                              onClick={() => handleDeleteAssetRule(rule.id)}
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
          </>
        )}
      </div>
    </div>
  );
}
