import { useQuery } from '@tanstack/react-query'
import {
  Database,
  Cpu,
  HardDrive,
  Wifi,
  CheckCircle,
  AlertCircle,
} from 'lucide-react'
import { adminApi, unwrapData } from '../services/api'

export default function SystemHealth() {
  const { data: health } = useQuery({
    queryKey: ['health-check'],
    queryFn: adminApi.getHealthCheck,
    refetchInterval: 5000,
  })

  const { data: dbStats } = useQuery({
    queryKey: ['database-stats'],
    queryFn: adminApi.getDatabaseStats,
    refetchInterval: 30000,
  })

  const { data: connections } = useQuery({
    queryKey: ['active-connections'],
    queryFn: adminApi.getActiveConnections,
    refetchInterval: 10000,
  })

  const healthPayload = unwrapData<any>(health)
  const dbPayload = unwrapData<any>(dbStats)
  const connectionPayload = unwrapData<any>(connections)

  const isHealthy = healthPayload?.status === 'ok'
  const database = dbPayload || {}
  const activeConnections = connectionPayload?.connections || connectionPayload || []

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-foreground">System Health</h1>
        <p className="mt-2 text-muted-foreground">
          Monitor system performance and health metrics
        </p>
      </div>

      {/* Overall Status */}
      <div
        className={`card border-l-4 ${
          isHealthy ? 'border-l-success bg-green-500/5' : 'border-l-error bg-red-500/5'
        }`}
      >
        <div className="flex items-center gap-4">
          <div
            className={`p-3 rounded-lg ${
              isHealthy ? 'bg-green-500/20' : 'bg-red-500/20'
            }`}
          >
            {isHealthy ? (
              <CheckCircle className="w-6 h-6 text-green-400" />
            ) : (
              <AlertCircle className="w-6 h-6 text-red-400" />
            )}
          </div>
          <div>
            <p className="font-semibold text-foreground text-lg">
              {isHealthy ? 'System Healthy' : 'System Issues Detected'}
            </p>
            <p className="text-sm text-muted-foreground">
              {isHealthy
                ? 'All services are operational'
                : 'Some services require attention'}
            </p>
          </div>
        </div>
      </div>

      {/* System Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="stat-card">
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2 bg-primary/20 rounded-lg">
              <Cpu className="w-5 h-5 text-primary" />
            </div>
            <h3 className="font-semibold text-foreground">CPU Usage</h3>
          </div>
          <p className="text-3xl font-bold text-foreground">
            {database.cpuUsage || '0'}%
          </p>
          <div className="mt-2 w-full bg-muted rounded-full h-2">
            <div
              className="bg-primary h-2 rounded-full transition-all"
              style={{ width: `${database.cpuUsage || 0}%` }}
            />
          </div>
        </div>

        <div className="stat-card">
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2 bg-blue-500/20 rounded-lg">
              <HardDrive className="w-5 h-5 text-blue-400" />
            </div>
            <h3 className="font-semibold text-foreground">Memory Usage</h3>
          </div>
          <p className="text-3xl font-bold text-foreground">
            {database.memoryUsage || '0'}%
          </p>
          <div className="mt-2 w-full bg-muted rounded-full h-2">
            <div
              className="bg-blue-500 h-2 rounded-full transition-all"
              style={{ width: `${database.memoryUsage || 0}%` }}
            />
          </div>
        </div>

        <div className="stat-card">
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2 bg-green-500/20 rounded-lg">
              <Database className="w-5 h-5 text-green-400" />
            </div>
            <h3 className="font-semibold text-foreground">DB Size</h3>
          </div>
          <p className="text-3xl font-bold text-foreground">
            {database.size || '0 MB'}
          </p>
          <p className="text-xs text-muted-foreground/70 mt-2">
            {database.collections || 0} collections
          </p>
        </div>

        <div className="stat-card">
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2 bg-yellow-500/20 rounded-lg">
              <Wifi className="w-5 h-5 text-yellow-400" />
            </div>
            <h3 className="font-semibold text-foreground">Connections</h3>
          </div>
          <p className="text-3xl font-bold text-foreground">
            {activeConnections.length || 0}
          </p>
          <p className="text-xs text-muted-foreground/70 mt-2">Active connections</p>
        </div>
      </div>

      {/* Database Collections */}
      <div className="card">
        <h2 className="text-lg font-semibold text-foreground mb-4">
          Database Collections
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {(database.collectionStats || []).map((collection: any) => (
            <div
              key={collection.name}
              className="p-4 bg-muted rounded-lg"
            >
              <div className="flex items-center justify-between mb-2">
                <h3 className="font-medium text-foreground">
                  {collection.name}
                </h3>
                <Database className="w-4 h-4 text-muted-foreground/70" />
              </div>
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">
                  Documents: <span className="font-semibold">{collection.count}</span>
                </p>
                <p className="text-sm text-muted-foreground">
                  Size: <span className="font-semibold">{collection.size}</span>
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Service Status */}
      <div className="card">
        <h2 className="text-lg font-semibold text-foreground mb-4">
          Service Status
        </h2>
        <div className="space-y-3">
          {[
            { name: 'API Server', status: 'operational', uptime: '99.99%' },
            { name: 'Database', status: 'operational', uptime: '99.95%' },
            { name: 'Instagram Webhook', status: 'operational', uptime: '99.87%' },
            { name: 'AI Service', status: 'operational', uptime: '99.92%' },
            { name: 'Email Service', status: 'operational', uptime: '99.88%' },
          ].map((service) => (
            <div
              key={service.name}
              className="flex items-center justify-between p-3 bg-muted rounded-lg"
            >
              <div className="flex items-center gap-3">
                <div className="w-2 h-2 rounded-full bg-green-500" />
                <span className="font-medium text-foreground">
                  {service.name}
                </span>
              </div>
              <div className="flex items-center gap-4">
                <span className="text-sm text-muted-foreground">
                  Uptime: {service.uptime}
                </span>
                <span className="badge badge-success">
                  {service.status}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
