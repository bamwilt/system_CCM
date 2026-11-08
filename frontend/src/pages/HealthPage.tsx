import { useEffect, useState } from 'react';
import { checkHealth } from '../services/api';

export default function HealthPage() {
  const [status, setStatus] = useState<string>('checking...');

  useEffect(() => {
    checkHealth()
      .then((data) => setStatus(JSON.stringify(data, null, 2)))
      .catch((err) => setStatus(`Error: ${err.message}`));
  }, []);

  return (
    <div>
      <h2>Estado del Sistema</h2>
      <pre>{status}</pre>
    </div>
  );
}
