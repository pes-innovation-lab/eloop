import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getAllUsers, updateUserRole, getUsersByRole } from '@/lib/db/user';
import { UserRole } from '@/types';

// Get all users (admin only)
export async function GET(request: Request) {
  try {
    const session = await auth();

    // User must be logged in
    if (!session?.user) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    // User must be admin or organizer
    if (session.user.role !== 'admin' && session.user.role !== 'organizer') {
      return NextResponse.json(
        { error: 'Admin or organizer access required' },
        { status: 403 }
      );
    }
    const { searchParams } = new URL(request.url);

    const role = searchParams.get('role');

    let users;
    if (role) {
      users = await getUsersByRole(role as UserRole);
    } else {
      users = await getAllUsers();
    }

    return NextResponse.json({ users });
  } catch (error) {
    console.error('Error fetching users:', error);
    return NextResponse.json(
      { error: 'Failed to fetch users' },
      { status: 500 }
    );
  }
}

// Update user role (admin or organizer with restrictions)
export async function PUT(request: Request) {
  try {
    const session = await auth();

    // User must be logged in
    if (!session?.user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    // Only admins or organizers allowed (organizers have limitations)
    if (session.user.role !== 'admin' && session.user.role !== 'organizer') {
      return NextResponse.json({ error: 'Admin or organizer access required' }, { status: 403 });
    }

    // Parse request body
    const body = await request.json();
    const { userId, role } = body;

    if (!userId || !role) {
      return NextResponse.json({ error: 'User ID and role are required' }, { status: 400 });
    }

    // Validate role (mentor is allowed)
    const validRoles: UserRole[] = ['admin', 'organizer', 'mentor', 'volunteer', 'participant', 'applicant'];
    if (!validRoles.includes(role as UserRole)) {
      return NextResponse.json({ error: 'Invalid role' }, { status: 400 });
    }

    // Don't allow users to change their own role
    if (userId === session.user.id) {
      return NextResponse.json({ error: 'Cannot change your own role' }, { status: 400 });
    }

    // If organizer is making the change, enforce restrictions
    if (session.user.role === 'organizer') {
      // Organizers cannot promote/demote admins or organizers
      const { getUserById } = await import('@/lib/db/user');
      const targetUser = await getUserById(userId);
      if (!targetUser) {
        return NextResponse.json({ error: 'User not found' }, { status: 404 });
      }

      if (targetUser.role === 'admin' || targetUser.role === 'organizer') {
        return NextResponse.json({ error: 'Cannot change admin or organizer roles' }, { status: 403 });
      }

      // Organizers may only set roles to these values
      const allowedForOrganizer: UserRole[] = ['mentor', 'volunteer', 'participant', 'applicant'];
      if (!allowedForOrganizer.includes(role as UserRole)) {
        return NextResponse.json({ error: 'Organizers cannot assign that role' }, { status: 403 });
      }
    }

    // If promoting to participant, require that the user has at least one registration with a QR code
    if (role === 'participant') {
      const { getUserRegistrations } = await import('@/lib/db/registration');
      const regs = await getUserRegistrations(userId);
      const hasQRCode = regs.some(r => r.qrCode && r.qrCode.trim() !== '');

      if (!hasQRCode) {
        return NextResponse.json({ error: 'Cannot promote applicant to participant: user has no registration QR code' }, { status: 400 });
      }
    }

    // Update user role
    const updatedUser = await updateUserRole(userId, role as UserRole);

    if (!updatedUser) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    return NextResponse.json({ user: updatedUser });
  } catch (error) {
    console.error('Error updating user role:', error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed to update user role' }, { status: 500 });
  }
}

// Delete a user (admin only)
export async function DELETE(request: Request) {
  try {
    const session = await auth();

    if (!session?.user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    if (session.user.role !== 'admin') {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    const body = await request.json();
    const { userId } = body;

    if (!userId) {
      return NextResponse.json({ error: 'User ID is required' }, { status: 400 });
    }

    // Prevent admins from deleting themselves
    if (userId === session.user.id) {
      return NextResponse.json({ error: 'Cannot delete your own user account' }, { status: 400 });
    }

    const { deleteUser } = await import('@/lib/db/user');
    try {
      const deleted = await deleteUser(userId);

      if (!deleted) {
        return NextResponse.json({ error: 'User not found or could not be deleted' }, { status: 404 });
      }

      return NextResponse.json({ success: true });
    } catch (e) {
      console.error('Error in deleteUser:', e instanceof Error ? e.message : e);
      const message = e instanceof Error ? e.message : 'Failed to delete user';
      return NextResponse.json({ error: message }, { status: 400 });
    }
  } catch (error) {
    console.error('Error deleting user:', error);
    return NextResponse.json({ error: 'Failed to delete user' }, { status: 500 });
  }
}
