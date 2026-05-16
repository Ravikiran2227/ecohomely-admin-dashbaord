import { Navigate, useLocation } from 'react-router-dom'
import { Card } from './Card'
import Btn from './Btn'
import PageHeader from './PageHeader'
import { useAuth } from '../context/authContextValue'
import { C } from '../theme'

export default function ProtectedRoute({ children, requiredRoles = [], requiredPermission = null, fallbackPath = '/login' }) {
  const location = useLocation()
  const { currentUser, error, hasPermission, loading, unauthorized } = useAuth()

  if (loading) {
    return (
      <div style={{ padding: 24 }}>
        <PageHeader title="Checking Access" sub="Loading your admin permissions." />
        <Card style={{ padding: 32, maxWidth: 720 }}>
          <div style={{ fontSize: 18, fontWeight: 800, color: C.text, marginBottom: 8 }}>Preparing your workspace...</div>
          <div style={{ fontSize: 14, color: C.muted, lineHeight: 1.7 }}>Fetching your current admin user, role, and permissions from the backend.</div>
        </Card>
      </div>
    )
  }

  if (!currentUser && !unauthorized && !error) {
    return <Navigate to={fallbackPath} replace state={{ from: location.pathname }} />
  }

  if (!currentUser) {
    return <Navigate to={fallbackPath} replace state={{ from: location.pathname }} />
  }

  const roleAllowed = requiredRoles.length === 0 || requiredRoles.includes(currentUser.role)
  const permissionAllowed = !requiredPermission || hasPermission(requiredPermission)

  if (roleAllowed && permissionAllowed) {
    return children
  }

  return (
    <div style={{ padding: 24 }}>
      <PageHeader title="Access Restricted" sub={`Your current role is ${currentUser.role}`} />
      <Card style={{ padding: 32, maxWidth: 720 }}>
        <div style={{ fontSize: 18, fontWeight: 800, color: C.text, marginBottom: 8 }}>You do not have permission to open this module.</div>
        <div style={{ fontSize: 14, color: C.muted, lineHeight: 1.7, marginBottom: 20 }}>
          This screen is protected by role-based access rules. Switch to a role with the required permission or return to the dashboard.
        </div>
        <Btn v="outline" onClick={() => window.history.back()}>Go Back</Btn>
      </Card>
    </div>
  )
}
