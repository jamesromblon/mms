import axios from 'axios'
import { useMemo, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import { dashboardData } from './data'

const apiMode = import.meta.env.VITE_API_MODE || 'api'
const client = axios.create({ baseURL: `${import.meta.env.VITE_API_URL || 'http://localhost:8000'}/api/marketplace`, timeout: 8000 })

client.interceptors.request.use((config) => {
  const token = localStorage.getItem('argo_access_token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

export async function getDashboard() {
  if (apiMode !== 'api') return dashboardData
  const response = await client.get('/dashboard')
  const payload = response.data
  return {
    ...payload,
    orderStatus: (payload.order_status || []).map((item, index) => ({ ...item, color: ['#079669', '#2563eb', '#d97706', '#e11d48'][index] })),
    topSellers: (payload.top_sellers || []).map((item) => [item.name, item.amount, item.width]),
    sellerHighlights: payload.seller_highlights || [],
    sellerMetrics: payload.seller_metrics || [],
  }
}

export function useMarketplaceDashboard() {
  return useQuery({
    queryKey: ['marketplace', 'dashboard'],
    queryFn: getDashboard,
    enabled: apiMode === 'api',
    initialData: apiMode === 'api' ? undefined : dashboardData,
  })
}

export async function getCollection(resource, params = {}) {
  if (apiMode !== 'api') return { items: [], page: 1, page_size: 25, total: 0 }
  const response = await client.get(`/${resource}`, { params })
  return response.data
}

export async function mutateMarketplace(method, path, data) {
  if (apiMode !== 'api') throw new Error('The API is required for this action.')
  const response = await client.request({ method, url: path, data })
  return response.data
}

export function useMarketplaceList(resource, fallback, params = {}, normalize = (item) => item) {
  const normalizeRef = useRef(normalize)
  normalizeRef.current = normalize
  const query = useQuery({
    queryKey: ['marketplace', resource, params],
    queryFn: () => getCollection(resource, params),
    enabled: apiMode === 'api',
    initialData: apiMode === 'api' ? undefined : { items: fallback },
  })
  const items = useMemo(() => (query.data?.items || (apiMode === 'api' ? [] : fallback)).map((item) => normalizeRef.current(item)), [fallback, query.data])
  return { ...query, items, isLive: apiMode === 'api' && Boolean(query.data) }
}

export { client }
