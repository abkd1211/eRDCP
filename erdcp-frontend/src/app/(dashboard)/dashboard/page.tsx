'use client';
import { useAuth } from '@/store/auth.store';
import SystemAdminView    from '@/components/role-views/SystemAdminView';
import HospitalAdminView  from '@/components/role-views/HospitalAdminView';
import PoliceAdminView    from '@/components/role-views/PoliceAdminView';
import FireAdminView      from '@/components/role-views/FireAdminView';
import DriverView         from '@/components/role-views/DriverView';

export default function DashboardPage() {
  const { user } = useAuth();
  switch (user?.role) {
    case 'SYSTEM_ADMIN':       return <SystemAdminView />;
    case 'HOSPITAL_ADMIN':     return <HospitalAdminView />;
    case 'POLICE_ADMIN':       return <PoliceAdminView />;
    case 'FIRE_SERVICE_ADMIN': return <FireAdminView />;
    case 'AMBULANCE_DRIVER':   return <DriverView />;
    default:                   return <SystemAdminView />;
  }
}
