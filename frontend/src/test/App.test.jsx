import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter } from 'react-router-dom'
import { afterEach, expect, test } from 'vitest'
import App from '../App'

afterEach(() => {
  cleanup()
  localStorage.clear()
})

function renderApp(path = '/dashboard') {
  window.history.pushState({}, '', path)
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={queryClient}><BrowserRouter><App /></BrowserRouter></QueryClientProvider>)
}

function signInAsAdmin() {
  localStorage.setItem('argo_access_token', 'demo.admin')
  localStorage.setItem('argo_portal_role', 'admin')
}

test('renders the marketplace dashboard shell', () => {
  signInAsAdmin()
  renderApp('/dashboard')
  expect(screen.getByText('Marketplace')).toBeInTheDocument()
  expect(screen.getByRole('heading', { name: 'Dashboard' })).toBeInTheDocument()
  expect(screen.getByText('GMV Trend')).toBeInTheDocument()
})

test('renders the public customer marketplace landing page', () => {
  renderApp('/')

  expect(screen.getByRole('heading', { name: /Shop trusted local sellers/ })).toBeInTheDocument()
  expect(screen.getByRole('link', { name: /Browse marketplace/ })).toHaveAttribute('href', '/marketplace')
  expect(screen.getByRole('link', { name: 'Customer sign in' })).toHaveAttribute('href', '/login?role=customer')
  expect(screen.getByRole('link', { name: /Admin sign in/ })).toHaveAttribute('href', '/login?role=admin')
})

test('keeps the catalog public but requires a customer session for checkout', async () => {
  renderApp('/marketplace')

  expect(screen.getByRole('heading', { name: 'Shop the catalog' })).toBeInTheDocument()
  expect(screen.getByText(/browsing publicly/i)).toBeInTheDocument()
  fireEvent.click(screen.getAllByRole('button', { name: /Add to cart/ })[0])
  fireEvent.click(screen.getByRole('button', { name: /Sign in to checkout/ }))

  expect(await screen.findByRole('heading', { name: 'Welcome back' })).toBeInTheDocument()
  expect(window.location.search).toBe('?role=customer')
})

test('renders seller product workspace separately from admin catalog', () => {
  localStorage.setItem('argo_access_token', 'dev-seller')
  localStorage.setItem('argo_portal_role', 'seller')
  renderApp('/seller/products')

  expect(screen.getByRole('heading', { name: 'My products' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: /New product/ })).toBeInTheDocument()
  localStorage.clear()
})

test('blocks a customer from opening the seller workspace', () => {
  localStorage.setItem('argo_access_token', 'demo.customer')
  localStorage.setItem('argo_portal_role', 'customer')
  renderApp('/seller')

  expect(screen.getByRole('heading', { name: 'Sign in as a seller' })).toBeInTheDocument()
  localStorage.clear()
})

test('shows and hides the login password', () => {
  renderApp('/login')

  const password = screen.getByLabelText('Password')
  expect(password).toHaveAttribute('type', 'password')

  fireEvent.click(screen.getByRole('button', { name: 'Show password' }))
  expect(password).toHaveAttribute('type', 'text')

  fireEvent.click(screen.getByRole('button', { name: 'Hide password' }))
  expect(password).toHaveAttribute('type', 'password')
})

test('compacts and expands the desktop sidebar control', () => {
  signInAsAdmin()
  const { container } = renderApp()
  const app = within(container)

  const compactButton = app.getByRole('button', { name: 'Compact sidebar' })
  fireEvent.click(compactButton)

  expect(app.getByRole('button', { name: 'Expand sidebar' })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
})

test('keeps admin catalog oversight separate from seller creation', () => {
  signInAsAdmin()
  renderApp('/products')

  expect(screen.getByRole('heading', { name: 'Products' })).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'New Product' })).not.toBeInTheDocument()
})

test('offers a proper Excel export from products', () => {
  signInAsAdmin()
  renderApp('/products')

  expect(screen.getAllByRole('button', { name: 'Export Excel' }).length).toBeGreaterThan(0)
})

test('selects products and asks for confirmation before bulk removal', () => {
  signInAsAdmin()
  const { container } = renderApp('/products')
  const app = within(container)

  fireEvent.click(app.getAllByRole('checkbox', { name: /Select product/ })[0])

  fireEvent.click(app.getByRole('button', { name: 'Delete 1 selected' }))

  expect(app.getByRole('dialog', { name: 'Remove 1 product?' })).toBeInTheDocument()
  expect(app.getByText(/This permanently removes/)).toBeInTheDocument()
})

test('opens category correction in the product edit form', () => {
  signInAsAdmin()
  const { container } = renderApp('/products')
  const app = within(container)

  fireEvent.click(app.getAllByRole('button', { name: /^Edit product / })[0])

  const modal = within(app.getByRole('dialog', { name: 'Edit product' }))
  expect(modal.getByLabelText(/Product name/)).toBeInTheDocument()
  expect(modal.getByLabelText(/^SKU/)).toBeInTheDocument()
  expect(modal.getByLabelText(/^Seller/)).toBeInTheDocument()
  expect(modal.getByLabelText(/Category/)).not.toHaveValue('')
  expect(modal.getByLabelText(/^Price/)).toBeInTheDocument()
  expect(modal.getByLabelText(/^Stock/)).toBeInTheDocument()
  expect(modal.getByLabelText(/^Description/)).toBeInTheDocument()
  expect(modal.getByLabelText(/^Image URL/)).toBeInTheDocument()
  expect(modal.getByRole('option', { name: 'Electronics' })).toBeInTheDocument()
})

test('blocks a seller from opening customer order history', () => {
  localStorage.setItem('argo_access_token', 'demo.seller')
  localStorage.setItem('argo_portal_role', 'seller')
  renderApp('/marketplace/orders')

  expect(screen.getByRole('heading', { name: 'Sign in as a customer' })).toBeInTheDocument()
})

test('shows only the signed-in role workspace in the public header', () => {
  localStorage.setItem('argo_access_token', 'demo.seller')
  localStorage.setItem('argo_portal_role', 'seller')
  renderApp('/')

  expect(screen.getAllByRole('link', { name: 'Seller workspace' }).length).toBeGreaterThan(0)
  expect(screen.queryByRole('link', { name: 'Admin dashboard' })).not.toBeInTheDocument()
  expect(screen.queryByRole('link', { name: 'My orders' })).not.toBeInTheDocument()
})

test('signs the admin out, clears the session, and returns to admin login', async () => {
  signInAsAdmin()
  renderApp('/products')

  fireEvent.click(screen.getByRole('button', { name: 'Open profile menu' }))
  fireEvent.click(screen.getByRole('button', { name: 'Sign out' }))

  expect(localStorage.getItem('argo_access_token')).toBeNull()
  expect(localStorage.getItem('argo_portal_role')).toBeNull()
  expect(await screen.findByRole('heading', { name: 'Welcome back' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'admin' })).toHaveClass('bg-white')
})

test('redirects unauthenticated admin routes to login', async () => {
  renderApp('/dashboard')

  expect(await screen.findByRole('heading', { name: 'Welcome back' })).toBeInTheDocument()
  expect(window.location.pathname).toBe('/login')
  expect(window.location.search).toBe('?role=admin')
})

test('shows a public not-found page for unknown routes', () => {
  renderApp('/not-a-real-page')

  expect(screen.getByRole('heading', { name: 'Page not found' })).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Go to landing page' })).toHaveAttribute('href', '/')
})
