import api from './api';
import type {
  User, TokenPair, Incident, Responder, Vehicle, Paginated,
  DashboardSnapshot, SlaReport, PeakHourEntry, RegionStat,
  TopResponder, ResponseTimeData, CallSession, ExtractedIncident,
  AgentStatus, NearbyIncident, IncidentType, IncidentStatus,
  ResponderType, ResponderStatus,
} from '@/types';

// ─── Helpers ──────────────────────────────────────────────────────────────────
const d = <T>(res: { data: { success: boolean; data: T } }) => res.data.data;

// ─── Auth ─────────────────────────────────────────────────────────────────────
export const authApi = {
  login: (email: string, password: string) =>
    api.post<{ success: boolean; data: { user: User; tokens: TokenPair } }>('/auth/login', { email, password }),
  register: (payload: { name: string; email: string; password: string; role: string }) =>
    api.post<{ success: boolean; data: { user: User; tokens: TokenPair } }>('/auth/register', payload),
  logout: (refreshToken?: string) =>
    api.post('/auth/logout', { refreshToken }),
  getProfile: () =>
    api.get<{ success: boolean; data: User }>('/auth/profile').then(d),
  updateProfile: (payload: { name?: string; currentPassword?: string; newPassword?: string }) =>
    api.put<{ success: boolean; data: User }>('/auth/profile', payload).then(d),
  listUsers: (page = 1, limit = 20) =>
    api.get<{ success: boolean; data: { users: User[]; total: number; page: number; pages: number } }>(`/auth/users?page=${page}&limit=${limit}`).then(d),
  updateRole: (id: string, role: string) =>
    api.put<{ success: boolean; data: User }>(`/auth/users/${id}/role`, { role }).then(d),
  deactivateUser: (id: string) =>
    api.delete(`/auth/users/${id}`),
  heartbeat: () =>
    api.post('/agent/operator/heartbeat').catch(() => {}),
};

// ─── Incidents ────────────────────────────────────────────────────────────────
export const incidentApi = {
  list: (params?: { page?: number; limit?: number; status?: IncidentStatus; type?: IncidentType }) =>
    api.get<{ success: boolean; data: Paginated<Incident> }>('/incidents', { params }).then(d),
  listOpen: () =>
    api.get<{ success: boolean; data: Incident[] }>('/incidents/open').then(d),
  getById: (id: string) =>
    api.get<{ success: boolean; data: Incident }>(`/incidents/${id}`).then(d),
  create: (payload: {
    citizenName: string; citizenPhone?: string; incidentType: IncidentType;
    latitude: number; longitude: number; address?: string; notes?: string; priority?: number;
  }) =>
    api.post<{ success: boolean; data: Incident }>('/incidents', payload).then(d),
  updateStatus: (id: string, status: IncidentStatus, note?: string) =>
    api.put<{ success: boolean; data: Incident }>(`/incidents/${id}/status`, { status, note }).then(d),
  getNearby: (lat: number, lng: number, radius = 200) =>
    api.get<{ success: boolean; data: NearbyIncident[] }>('/incidents/nearby', { params: { lat, lng, radius } }).then(d),
  linkReport: (payload: { parentIncidentId: string; citizenName: string; citizenPhone?: string; notes?: string }) =>
    api.post('/incidents/link', payload).then(d),
  getLinkedReports: (id: string) =>
    api.get(`/incidents/${id}/linked-reports`).then(d),
};

// ─── Responders ───────────────────────────────────────────────────────────────
export const responderApi = {
  list: (params?: { type?: ResponderType; ownOnly?: boolean }) =>
    api.get<{ success: boolean; data: Responder[] }>('/responders', { params }).then(d),
  listHospitals: () =>
    api.get<{ success: boolean; data: Responder[] }>('/responders/hospitals').then(d),
  create: (payload: { name: string; type: ResponderType; stationName: string; latitude: number; longitude: number; phone?: string; address?: string; capacity?: number }) =>
    api.post<{ success: boolean; data: Responder }>('/responders', payload).then(d),
  updateAvailability: (id: string, status: ResponderStatus) =>
    api.put<{ success: boolean; data: Responder }>(`/responders/${id}/availability`, { status }).then(d),
  updateCapacity: (id: string, totalBeds: number, availableBeds: number) =>
    api.put(`/responders/${id}/capacity`, { totalBeds, availableBeds }).then(d),
  updateLocation: (id: string, latitude: number, longitude: number) =>
    api.put(`/responders/${id}/location`, { latitude, longitude }).then(d),
};

// ─── Vehicles ─────────────────────────────────────────────────────────────────
export const vehicleApi = {
  list: (params?: { type?: string; status?: string }) =>
    api.get<{ success: boolean; data: Vehicle[] }>('/vehicles', { params }).then(d),
  getById: (id: string) =>
    api.get<{ success: boolean; data: Vehicle }>(`/vehicles/${id}`).then(d),
  getLocation: (id: string) =>
    api.get(`/vehicles/${id}/location`).then(d),
  getAssignment: (id: string) =>
    api.get(`/vehicles/${id}/assignment`).then(d),
  getByIncident: (incidentId: string) =>
    api.get<{ success: boolean; data: Vehicle[] }>(`/dispatch/${incidentId}`).then(d),
  register: (payload: {
    vehicleCode: string; type: string; stationId: string; stationName: string;
    incidentServiceId: string; driverUserId: string; driverName: string; latitude: number; longitude: number;
  }) => api.post('/vehicles/register', payload).then(d),
};

// ─── Analytics ────────────────────────────────────────────────────────────────
export const analyticsApi = {
  getDashboard: () =>
    api.get<{ success: boolean; data: DashboardSnapshot }>('/analytics/dashboard').then(d),
  getSla: (period = 'week') =>
    api.get<{ success: boolean; data: SlaReport }>('/analytics/sla', { params: { period } }).then(d),
  getPeakHours: (period = 'month') =>
    api.get<{ success: boolean; data: PeakHourEntry[] }>('/analytics/peak-hours', { params: { period } }).then(d),
  getByRegion: (period = 'month') =>
    api.get<{ success: boolean; data: RegionStat[] }>('/analytics/incidents-by-region', { params: { period } }).then(d),
  getTopResponders: (limit = 10) =>
    api.get<{ success: boolean; data: TopResponder[] }>('/analytics/top-responders', { params: { limit } }).then(d),
  getResponseTimes: (period = 'week') =>
    api.get<{ success: boolean; data: ResponseTimeData }>('/analytics/response-times', { params: { period } }).then(d),
  getResourceUtilization: () =>
    api.get('/analytics/resource-utilization').then(d),
};

// ─── AI Agent ─────────────────────────────────────────────────────────────────
export const agentApi = {
  getStatus: () =>
    api.get<{ success: boolean; data: AgentStatus }>('/agent/status').then(d),
  listSessions: (page = 1, limit = 20) =>
    api.get<{ success: boolean; data: Paginated<CallSession> }>('/agent/calls', { params: { page, limit } }).then(d),
  getSession: (id: string) =>
    api.get<{ success: boolean; data: { session: CallSession; transcription: { text: string; language?: string; confidence?: number } | null; extraction: ExtractedIncident | null } }>(`/agent/calls/${id}`).then(d),
  ingestCall: (formData: FormData) =>
    api.post('/agent/call/ingest', formData, { headers: { 'Content-Type': 'multipart/form-data' } }).then(d),
  reviewSession: (id: string, corrections: Record<string, string>) =>
    api.put(`/agent/calls/${id}/review`, { corrections }).then(d),
  replayNlp: (id: string) =>
    api.post(`/agent/calls/${id}/replay`).then(d),
  simulateCall: (textScript: string, callerPhone?: string) =>
    api.post('/agent/call/simulate', { textScript, callerPhone }).then(d),
  markOnline: () =>
    api.post('/agent/operator/online').then(d),
  markOffline: () =>
    api.post('/agent/operator/offline').then(d),
  heartbeat: () =>
    api.post('/agent/operator/heartbeat').then(d),
  resetCircuit: () =>
    api.delete('/gateway/circuits/agent').then(d),
};

// ─── Simulation ───────────────────────────────────────────────────────────────
export const simulationApi = {
  setSpeed: (multiplier: number) =>
    api.post('/simulation/speed', { multiplier }).then(d),
  getSpeed: () =>
    api.get('/simulation/speed').then(d),
  triggerBlockage: (vehicleId: string) =>
    api.post(`/simulation/blockage/${vehicleId}`).then(d),
  getActive: () =>
    api.get('/simulation/active').then(d),
};

// ─── Health ───────────────────────────────────────────────────────────────────
export const healthApi = {
  all: () => api.get('/health/all').then((r) => r.data),
};
