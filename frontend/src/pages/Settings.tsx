import { TimezoneSettings } from '../components/common/TimezoneSettings';
import { useState } from 'react';
import { useAuthContext } from '../components/common/AuthProvider';
import { Card, CardContent, CardHeader } from '../components/common/Card';
import { Button } from '../components/common/Button';
import { Input } from '../components/common/Input';
import { useNotificationPreferences, useUpdateNotificationPreferences, useTestEmail, useTestSms } from '../hooks/useNotifications';
import { useAIConnection } from '../hooks/useUserSettings';

export function Settings() {
  const { user, logout } = useAuthContext();
  const { data: prefs, isLoading: prefsLoading } = useNotificationPreferences();
  const updatePrefs = useUpdateNotificationPreferences();
  const testEmail = useTestEmail();
  const testSms = useTestSms();

  // Anvil AI connection status (server-side router)
  const { data: aiConnection, isLoading: aiLoading } = useAIConnection();

  const [phoneNumber, setPhoneNumber] = useState('');

  const isLoading = prefsLoading || aiLoading;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600" />
      </div>
    );
  }

  const aiStatus = aiConnection
    ? aiConnection.is_configured && aiConnection.is_reachable
      ? { label: 'Connected', ok: true }
      : { label: aiConnection.is_configured ? 'Unreachable' : 'Not configured', ok: false }
    : { label: 'Unknown', ok: false };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Settings</h1>

      <Card>
        <CardHeader>
          <h3 className="font-medium text-gray-900">Profile</h3>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">Name</label>
            <p className="mt-1 text-gray-900">{user?.name}</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Email</label>
            <p className="mt-1 text-gray-900">{user?.email}</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Token Balance</label>
            <p className="mt-1 text-gray-900">{user?.token_balance} tokens</p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <h3 className="font-medium text-gray-900">AI Assistant</h3>
          <p className="text-sm text-gray-600 mt-1">
            AI features run on a shared self-hosted router. No API keys required.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
            <div>
              <p className="font-semibold text-gray-900">Anvil Router</p>
              <p className="text-sm text-gray-600">
                {aiConnection?.model ? `Model: ${aiConnection.model}` : 'AI content generation'}
              </p>
            </div>
            <span
              className={`text-xs font-medium px-2.5 py-1 rounded-full ${
                aiStatus.ok ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
              }`}
            >
              {aiStatus.label}
            </span>
          </div>
          {!aiStatus.ok && aiConnection?.message && (
            <div className="p-3 rounded-lg text-sm bg-red-50 text-red-800">
              {aiConnection.message}
            </div>
          )}
        </CardContent>
      </Card>

      <TimezoneSettings key={user?.id} />
      <Card>
        <CardHeader>
          <h3 className="font-medium text-gray-900">Notifications</h3>
        </CardHeader>
        <CardContent className="space-y-1">
          {/* Email notifications toggle */}
          <button
            onClick={() => updatePrefs.mutate({ email_enabled: !prefs?.email_enabled })}
            className="w-full flex items-center justify-between p-3 -mx-3 rounded-lg hover:bg-gray-50 transition-colors"
          >
            <div className="text-left">
              <p className="font-medium text-gray-900">Email notifications</p>
              <p className="text-sm text-gray-600">Receive reminders and updates via email</p>
            </div>
            <div
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors flex-shrink-0 ml-4 ${
                prefs?.email_enabled ? 'bg-indigo-600' : 'bg-gray-300'
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                  prefs?.email_enabled ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </div>
          </button>

          {/* Daily quiz toggle */}
          <button
            onClick={() => updatePrefs.mutate({ daily_quiz_enabled: !prefs?.daily_quiz_enabled })}
            className="w-full flex items-center justify-between p-3 -mx-3 rounded-lg hover:bg-gray-50 transition-colors"
          >
            <div className="text-left">
              <p className="font-medium text-gray-900">Daily quiz</p>
              <p className="text-sm text-gray-600">Receive a daily quiz via SMS</p>
            </div>
            <div
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors flex-shrink-0 ml-4 ${
                prefs?.daily_quiz_enabled ? 'bg-indigo-600' : 'bg-gray-300'
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                  prefs?.daily_quiz_enabled ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </div>
          </button>

          {/* Phone number section */}
          <div className="pt-4 mt-4 border-t border-gray-100">
            <label className="block text-sm font-medium text-gray-700 mb-2">Phone Number</label>
            <div className="space-y-3">
              <Input
                id="phone"
                value={phoneNumber || prefs?.phone_number || ''}
                onChange={(e) => setPhoneNumber(e.target.value)}
                placeholder="+1 (555) 123-4567"
              />
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => {
                    if (phoneNumber) {
                      updatePrefs.mutate({ phone_number: phoneNumber, sms_enabled: true });
                    }
                  }}
                  isLoading={updatePrefs.isPending}
                  disabled={!phoneNumber || phoneNumber === prefs?.phone_number}
                >
                  Save Number
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => testEmail.mutate()}
                  isLoading={testEmail.isPending}
                >
                  Test Email
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => testSms.mutate()}
                  isLoading={testSms.isPending}
                  disabled={!prefs?.phone_number}
                >
                  Test SMS
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <h3 className="font-medium text-gray-900">Account</h3>
        </CardHeader>
        <CardContent>
          <Button variant="danger" onClick={logout}>
            Sign out
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
