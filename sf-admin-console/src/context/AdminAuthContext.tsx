import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react'
import axios from 'axios'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000'

interface User {
  id: string
  email: string
  role: 'user' | 'admin'
}

interface AdminAuthContextType {
  user: User | null
  token: string | null
  loading: boolean
  login: (email: string, password: string) => Promise<void>
  logout: () => void
}

const AdminAuthContext = createContext<AdminAuthContextType | undefined>(undefined)

export const AdminAuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null)
  const [token, setToken] = useState<string | null>(localStorage.getItem('admin_token'))
  const [loading, setLoading] = useState(true)

  // Setup axios defaults
  useEffect(() => {
    if (token) {
      axios.defaults.headers.common['Authorization'] = `Bearer ${token}`
    } else {
      delete axios.defaults.headers.common['Authorization']
    }
  }, [token])

  // Verify admin on mount
  useEffect(() => {
    const verifyAdmin = async () => {
      if (!token) {
        setLoading(false)
        return
      }

      try {
        const response = await axios.get(`${API_URL}/api/auth/me`)
        const userData = response.data.user

        // Check if user is admin
        if (userData.role !== 'admin') {
          console.error('User is not an admin')
          logout()
          return
        }

        setUser({
          id: userData._id,
          email: userData.email,
          role: userData.role,
        })
      } catch (error) {
        console.error('Admin verification failed:', error)
        logout()
      } finally {
        setLoading(false)
      }
    }

    verifyAdmin()
  }, [token])

  const login = async (email: string, password: string) => {
    try {
      const response = await axios.post(`${API_URL}/api/auth/login`, {
        email,
        password,
      })

      const { token: newToken, user: userData } = response.data

      // Verify user is admin
      if (userData.role !== 'admin') {
        throw new Error('Access denied. Admin privileges required.')
      }

      localStorage.setItem('admin_token', newToken)
      setToken(newToken)
      setUser({
        id: userData.id,
        email: userData.email,
        role: userData.role,
      })
    } catch (error: any) {
      if (error.message === 'Access denied. Admin privileges required.') {
        throw error
      }
      throw new Error(error.response?.data?.error || 'Login failed')
    }
  }

  const logout = () => {
    localStorage.removeItem('admin_token')
    setToken(null)
    setUser(null)
    delete axios.defaults.headers.common['Authorization']
  }

  return (
    <AdminAuthContext.Provider value={{ user, token, loading, login, logout }}>
      {children}
    </AdminAuthContext.Provider>
  )
}

export const useAdminAuth = () => {
  const context = useContext(AdminAuthContext)
  if (context === undefined) {
    throw new Error('useAdminAuth must be used within AdminAuthProvider')
  }
  return context
}
