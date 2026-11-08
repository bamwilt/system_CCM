import axios from 'axios';

const api = axios.create({
  baseURL: '/api',
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
  },
});

export interface HealthResponse {
  status: string;
  timestamp: string;
  uptime: number;
  environment: string;
  database: string;
}

export async function checkHealth(): Promise<HealthResponse> {
  const { data } = await api.get<HealthResponse>('/health');
  return data;
}

export default api;
