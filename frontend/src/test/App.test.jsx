import { fireEvent, render, screen, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter } from 'react-router-dom'
import { expect, test } from 'vitest'
import App from '../App'

function renderApp(path = '/dashboard') {
  window.history.pushState({}, '', path)
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={queryClient}><BrowserRouter><App /></BrowserRouter></QueryClientProvider>)
}

test('renders the marketplace dashboard shell', () => {
  renderApp()
  expect(screen.getByText('Marketplace')).toBeInTheDocument()
  expect(screen.getByRole('heading', { name: 'Dashboard' })).toBeInTheDocument()
  expect(screen.getByText('GMV Trend')).toBeInTheDocument()
})

test('compacts and expands the desktop sidebar control', () => {
  const { container } = renderApp()
  const app = within(container)

  const compactButton = app.getByRole('button', { name: 'Compact sidebar' })
  fireEvent.click(compactButton)

  expect(app.getByRole('button', { name: 'Expand sidebar' })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
})

test('opens a complete create-product form', () => {
  renderApp('/products')

  fireEvent.click(screen.getByRole('button', { name: 'New Product' }))

  const dialog = screen.getByRole('dialog', { name: 'New product' })
  const modal = within(dialog)
  expect(dialog).toBeInTheDocument()
  expect(modal.getByLabelText(/Product name/)).toBeInTheDocument()
  expect(modal.getByLabelText(/^SKU/)).toBeInTheDocument()
  expect(modal.getByLabelText(/^Unit price/)).toBeInTheDocument()
  expect(modal.getByLabelText(/^Seller/)).toBeInTheDocument()
  expect(modal.getByLabelText(/^Category/)).toBeInTheDocument()
  expect(modal.getByLabelText(/^Stock on hand/)).toBeInTheDocument()
  expect(modal.getByText('Pending Review')).toBeInTheDocument()
})
