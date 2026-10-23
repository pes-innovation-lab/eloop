'use client';

import { useEffect, useState } from 'react';
import { UserProfile, UserRole } from '@/types';
import { useSearchParams } from 'next/navigation';
import { useSession } from 'next-auth/react';

export default function AdminUsersPage() {
  const searchParams = useSearchParams();
  const filterParam = searchParams.get('filter');
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [filteredUsers, setFilteredUsers] = useState<UserProfile[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [editingUser, setEditingUser] = useState<string | null>(null);
  const [selectedRole, setSelectedRole] = useState<UserRole>('participant');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [roleFilter, setRoleFilter] = useState<'all' | 'applicant' | UserRole>(filterParam === 'unapproved' ? 'applicant' : filterParam === 'applicant' ? 'applicant' : 'all');

  const { data: session } = useSession();

  // Build visible users for this viewer (organizers shouldn't see admins or themselves)
  const visibleUsers = session?.user?.role === 'organizer'
    ? users.filter(u => u.role !== 'admin' && u.id !== session.user.id)
    : users;

  // Build filter options based on visible users
  const filterOptions: Array<{ key: 'all' | 'applicant' | UserRole; label: string; count: number }> = [
    { key: 'all', label: 'All users', count: visibleUsers.length },
    { key: 'applicant', label: 'Applicants', count: visibleUsers.filter(u => u.role === 'applicant').length },
    { key: 'participant', label: 'Participants', count: visibleUsers.filter(u => u.role === 'participant').length },
    { key: 'organizer', label: 'Organizers', count: visibleUsers.filter(u => u.role === 'organizer').length },
    { key: 'mentor', label: 'Mentors', count: visibleUsers.filter(u => u.role === 'mentor').length },
    { key: 'volunteer', label: 'Volunteers', count: visibleUsers.filter(u => u.role === 'volunteer').length },
  ];

  // Admin option remains available only to admins (counts use full users list)
  if (session?.user?.role === 'admin') {
    filterOptions.push({ key: 'admin', label: 'Admins', count: users.filter(u => u.role === 'admin').length });
  }

  // Fetch users
  useEffect(() => {
    const fetchUsers = async () => {
      try {
        const response = await fetch('/api/admin/users');

        if (!response.ok) {
          throw new Error('Failed to fetch users');
        }

        const data = await response.json();
        setUsers(data.users);
      } catch (err) {
        setError('Error loading users: ' + (err instanceof Error ? err.message : String(err)));
      } finally {
        setIsLoading(false);
      }
    };

    fetchUsers();
  }, []);

  // Filter users based on role filter; if organizer, hide admins and self
  useEffect(() => {
    const q = searchQuery.trim().toLowerCase();
    const byRole = roleFilter === 'all' ? visibleUsers : visibleUsers.filter(user => user.role === roleFilter);

    if (!q) {
      setFilteredUsers(byRole);
      return;
    }

    setFilteredUsers(byRole.filter(user => {
      return (user.name || '').toLowerCase().includes(q) || (user.email || '').toLowerCase().includes(q);
    }));
  }, [users, roleFilter, searchQuery, session]);

  // Update user role
  const updateUserRole = async (userId: string, role: UserRole) => {
    try {
      setIsLoading(true);
      setError(null);
      setSuccessMessage(null);

      const response = await fetch('/api/admin/users', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ userId, role }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to update user role');
      }

      const { user: updatedUser } = await response.json();

      // Update users array
      setUsers(prevUsers =>
        prevUsers.map(user =>
          user.id === updatedUser.id ? updatedUser : user
        )
      );

      setSuccessMessage(`User ${updatedUser.name} role updated to ${updatedUser.role}`);
      setEditingUser(null);
    } catch (err) {
      setError('Error updating user: ' + (err instanceof Error ? err.message : String(err)));
    } finally {
      setIsLoading(false);
    }
  };

  // Handle role change
  const handleRoleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setSelectedRole(e.target.value as UserRole);
  };

  // Get role badge color
  const getRoleBadgeColor = (role: UserRole) => {
    switch (role) {
      case 'admin': return 'bg-purple-500';
      case 'organizer': return 'bg-blue-500';
      case 'mentor': return 'bg-indigo-500';
      case 'volunteer': return 'bg-teal-500';
      case 'participant': return 'bg-green-500';
      case 'applicant': return 'bg-amber-500';
      default: return 'bg-gray-500';
    }
  };

  return (
    <div className="space-y-6 md:space-y-8">
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl">
          {error}
        </div>
      )}

      {successMessage && (
        <div className="bg-green-50 border border-green-200 text-green-800 px-4 py-3 rounded-xl">
          {successMessage}
        </div>
      )}

      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-5 space-y-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-500">Administration</p>
            <h1 className="text-2xl font-semibold text-slate-900">User Management</h1>
            <p className="text-slate-600 mt-1">Search, filter, and adjust roles without leaving this page.</p>
          </div>
          <div className="w-full md:w-72">
            <input
              type="search"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search name or email"
              className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm shadow-sm focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
            />
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {filterOptions.map(option => {
            const active = roleFilter === option.key;
            return (
              <button
                key={option.key}
                onClick={() => setRoleFilter(option.key)}
                className={`px-3 py-2 rounded-full text-sm font-medium border transition ${active
                  ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                  : 'bg-white text-slate-700 border-slate-200 hover:border-indigo-200'
                  }`}
              >
                {option.label} ({option.count})
              </button>
            );
          })}
        </div>
      </div>

      {isLoading && <div className="text-slate-500 text-sm">Loading users...</div>}

      <div className="hidden sm:block overflow-x-auto">
        <div className="min-w-full bg-white rounded-2xl border border-slate-200 shadow-sm">
          <table className="min-w-full">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase">Name</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase">Email</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase">Role</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase">Created</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredUsers.map(user => (
                <tr key={user.id} className="hover:bg-slate-50">
                  <td className="px-6 py-4 text-sm text-slate-900">{user.name}</td>
                  <td className="px-6 py-4 text-sm text-slate-600">{user.email}</td>
                  <td className="px-6 py-4">
                    <span className={`px-2.5 py-1 text-xs font-semibold rounded-full text-white ${getRoleBadgeColor(user.role)}`}>
                      {user.role}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm text-slate-500">
                    {new Date(user.createdAt).toLocaleDateString()}
                  </td>
                  <td className="px-6 py-4 text-sm">
                    {editingUser === user.id ? (
                      <div className="flex items-center gap-2">
                        <select
                          value={selectedRole}
                          onChange={handleRoleChange}
                          className="border border-slate-200 rounded-lg px-2 py-1 text-sm focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
                        >
                          <option value="applicant">Applicant</option>
                          <option value="participant">Participant</option>
                          <option value="mentor">Mentor</option>
                          <option value="volunteer">Volunteer</option>
                          {session?.user?.role === 'admin' && (
                            <>
                              <option value="organizer">Organizer</option>
                              <option value="admin">Admin</option>
                            </>
                          )}
                        </select>
                        <button
                          onClick={() => updateUserRole(user.id, selectedRole)}
                          className="px-2.5 py-1 rounded-lg bg-indigo-600 text-white text-sm font-medium shadow hover:bg-indigo-700"
                        >
                          Save
                        </button>
                        <button
                          onClick={() => setEditingUser(null)}
                          className="px-2.5 py-1 rounded-lg border border-slate-200 text-slate-700 text-sm font-medium hover:border-slate-300"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-3">
                        <button
                          onClick={() => {
                            setSelectedRole(user.role);
                            setEditingUser(user.id);
                          }}
                          className="text-indigo-600 hover:text-indigo-800 font-medium"
                        >
                          Change role
                        </button>
                        {session?.user?.role === 'admin' ? (
                          <button
                            onClick={async () => {
                              if (!confirm(`Delete user ${user.name} <${user.email}>? This action cannot be undone.`)) return;
                              try {
                                setIsLoading(true);
                                setError(null);
                                const res = await fetch('/api/admin/users', {
                                  method: 'DELETE',
                                  headers: { 'Content-Type': 'application/json' },
                                  body: JSON.stringify({ userId: user.id }),
                                });
                                if (!res.ok) {
                                  const err = await res.json();
                                  throw new Error(err?.error || 'Failed to delete user');
                                }
                                setUsers(prev => prev.filter(u => u.id !== user.id));
                                setSuccessMessage(`User ${user.name} deleted`);
                              } catch (err) {
                                setError('Error deleting user: ' + (err instanceof Error ? err.message : String(err)));
                              } finally {
                                setIsLoading(false);
                              }
                            }}
                            className="text-rose-600 hover:text-rose-800 font-medium"
                          >
                            Delete
                          </button>
                        ) : null}
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="sm:hidden space-y-3">
        {filteredUsers.map(user => (
          <div key={user.id} className="bg-white border border-slate-200 rounded-2xl shadow-sm p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="space-y-1">
                <div className="font-semibold text-sm text-slate-900">{user.name}</div>
                <div className="text-sm text-slate-600">{user.email}</div>
                <span className={`inline-block px-2.5 py-1 text-xs font-semibold rounded-full text-white ${getRoleBadgeColor(user.role)}`}>{user.role}</span>
              </div>
              <div className="text-right text-sm text-slate-500">
                {new Date(user.createdAt).toLocaleDateString()}
                <div className="mt-2">
                  {editingUser === user.id ? (
                    <div className="flex items-center gap-2">
                      <select
                        value={selectedRole}
                        onChange={handleRoleChange}
                        className="border border-slate-200 rounded-lg px-2 py-1 text-sm"
                      >
                        <option value="applicant">Applicant</option>
                        <option value="participant">Participant</option>
                        <option value="mentor">Mentor</option>
                        <option value="volunteer">Volunteer</option>
                        <option value="organizer">Organizer</option>
                        <option value="admin">Admin</option>
                      </select>
                      <button
                        onClick={() => updateUserRole(user.id, selectedRole)}
                        className="px-2.5 py-1 rounded-lg bg-indigo-600 text-white text-sm font-medium"
                      >
                        Save
                      </button>
                    </div>
                  ) : (
                    <div className="flex flex-col items-end gap-2">
                      <button
                        onClick={() => {
                          setSelectedRole(user.role);
                          setEditingUser(user.id);
                        }}
                        className="text-indigo-600 hover:text-indigo-800 font-medium"
                      >
                        Change role
                      </button>
                      {session?.user?.role === 'admin' ? (
                        <button
                          onClick={async () => {
                            if (!confirm(`Delete user ${user.name} <${user.email}>? This action cannot be undone.`)) return;
                            try {
                              setIsLoading(true);
                              setError(null);
                              const res = await fetch('/api/admin/users', {
                                method: 'DELETE',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ userId: user.id }),
                              });
                              if (!res.ok) {
                                const err = await res.json();
                                throw new Error(err?.error || 'Failed to delete user');
                              }
                              setUsers(prev => prev.filter(u => u.id !== user.id));
                              setSuccessMessage(`User ${user.name} deleted`);
                            } catch (err) {
                              setError('Error deleting user: ' + (err instanceof Error ? err.message : String(err)));
                            } finally {
                              setIsLoading(false);
                            }
                          }}
                          className="text-rose-600 hover:text-rose-800 font-medium"
                        >
                          Delete
                        </button>
                      ) : null}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        ))}

        {filteredUsers.length === 0 && !isLoading && (
          <div className="bg-white border border-dashed border-slate-300 rounded-2xl p-6 text-center text-slate-500">
            No {roleFilter === 'all' ? '' : roleFilter + ' '}users found.
          </div>
        )}
      </div>
    </div>
  );
}
