'use client';

import React, { useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import SharedDashboardLayout from '@/components/dashboard/SharedDashboardLayout';
import ELogoLoader from '@/components/ui/ELogoLoader';
import dynamic from 'next/dynamic';
const GuidedTour = dynamic(() => import('@/components/dashboard/GuidedTour'), { ssr: false });
import type { UserRole } from '@/types';

const getRoleConfig = (role: UserRole) => {
  switch (role) {
    case 'admin':
      return {
        title: 'Admin Dashboard',
        colorScheme: 'purple' as const,
        roleLabel: 'Administrator',
        navigation: [
          {
            title: 'Overview',
            items: [
              { href: '/dashboard', label: 'Dashboard' },
            ],
          },
          {
            title: 'Administration',
            items: [
              { href: '/dashboard/users', label: 'User Management' },
            ],
          },
        ],
      };
    case 'organizer':
      return {
        title: 'Organizer Dashboard',
        colorScheme: 'blue' as const,
        roleLabel: 'Event Organizer',
        navigation: [
          {
            title: 'Overview',
            items: [
              { href: '/dashboard', label: 'Dashboard' },
            ],
          },
          {
            title: 'Management',
            items: [
              { href: '/dashboard/users', label: 'User Management' },
            ],
          },
        ],
      };
    case 'volunteer':
      return {
        title: 'Volunteer Dashboard',
        colorScheme: 'teal' as const,
        roleLabel: 'Event Volunteer',
        navigation: [
          {
            title: 'Check-In',
            items: [
              { href: '/dashboard/events/check-in', label: 'QR Scanner' },
            ],
          },
        ],
      };
    case 'applicant':
      return {
        title: 'Welcome',
        colorScheme: 'amber' as const,
        roleLabel: 'Applicant',
        navigation: [
          {
            title: 'Get Started',
            items: [
              { href: '/dashboard', label: 'Home' },
              { href: '/dashboard/events', label: 'Browse Events' },
            ],
          },
        ],
      };
    case 'mentor':
      return {
        title: 'Mentor Dashboard',
        colorScheme: 'rose' as const,
        roleLabel: 'Mentor',
        navigation: [
          {
            title: 'Overview',
            items: [
              { href: '/dashboard', label: 'Dashboard' },
            ],
          },
        ],
      };
    case 'participant':
    default:
      return {
        title: 'Participant Dashboard',
        colorScheme: 'green' as const,
        roleLabel: 'Participant',
        navigation: [
          {
            title: 'My Activity',
            items: [
              { href: '/dashboard', label: 'Dashboard' },
            ],
          },
        ],
      };
  }
};

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { data: session, status } = useSession();
  const router = useRouter();

  // Tour visibility state (declare early to keep hook order stable)
  const [showTour, setShowTour] = React.useState(false);

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/auth/signin');
    }
  }, [status, router]);

  // Listen for start signal from pages (e.g., UnifiedDashboard)
  useEffect(() => {
    const onStart = () => setShowTour(true);
    const handler = (e: Event) => onStart();
    window.addEventListener('eloop:tour-start', handler as EventListener);
    return () => window.removeEventListener('eloop:tour-start', handler as EventListener);
  }, []);

  if (status === 'loading') {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <ELogoLoader size={56} colorClass="text-purple-600" label="Loading dashboard..." />
      </div>
    );
  }

  if (!session?.user) {
    return null;
  }

  const role = session.user.role || 'participant';
  const config = getRoleConfig(role);


  function onTourClose() {
    setShowTour(false);
  }

  return (
    <SharedDashboardLayout
      title={config.title}
      colorScheme={config.colorScheme}
      roleLabel={config.roleLabel}
      navigation={config.navigation}
    >
      {children}

      <GuidedTour open={showTour} onClose={onTourClose} />
    </SharedDashboardLayout>
  );
}
