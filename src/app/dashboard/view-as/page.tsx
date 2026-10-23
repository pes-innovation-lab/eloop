"use client";

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import UserRegistrationsSection from '@/components/dashboard/UserRegistrationsSection';

export default function AdminViewAsPage() {
  const { data: session } = useSession();
  const [users, setUsers] = useState<Array<{ id: string; name: string; email: string }>>([]);
  const [selectedUser, setSelectedUser] = useState<string | null>(null);

  useEffect(() => {
    const fetchUsers = async () => {
      try {
        const res = await fetch('/api/users');
        if (!res.ok) throw new Error('Failed to fetch users');
        const data = await res.json();
        setUsers(data.users || []);
      } catch (err) {
        console.error('Failed to load users for view-as:', err);
      }
    };

    if (session?.user?.role === 'admin') fetchUsers();
  }, [session]);

  if (!session?.user || session.user.role !== 'admin') {
    return <div className="mx-6 py-6 text-slate-600">Unauthorized</div>;
  }

  return (
    <div className="space-y-6">
      <div className="mx-6 pt-6">
        <h1 className="text-2xl font-semibold text-slate-900">View as User</h1>
        <p className="text-slate-500 mt-1">Preview a participant&apos;s registration view</p>
      </div>

      <div className="mx-6">
        <label className="block text-sm font-medium text-slate-700 mb-2">Select user to preview</label>
        <select
          value={selectedUser ?? ''}
          onChange={e => setSelectedUser(e.target.value || null)}
          className="w-full border border-slate-200 rounded-lg p-2.5 text-slate-900 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
        >
          <option value="">Choose a user...</option>
          {users.map(u => (
            <option key={u.id} value={u.id}>{u.name} — {u.email}</option>
          ))}
        </select>
      </div>

      {selectedUser ? (
        <div className="mx-6">
          <h2 className="text-lg font-semibold text-slate-900 mb-4">Preview</h2>
          <UserRegistrationsSection viewAsUserId={selectedUser} />
        </div>
      ) : (
        <div className="mx-6 bg-white border border-dashed border-slate-300 rounded-2xl p-6 text-center text-slate-500">
          Select a user above to preview their participant dashboard.
        </div>
      )}
    </div>
  );
}
