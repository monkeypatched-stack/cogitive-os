import { createBrowserRouter } from 'react-router-dom'
import { AppShell } from '../layout/AppShell'

export const router = createBrowserRouter([
  { path: '/', element: <AppShell /> },
  // The dashboard owns its internal navigation. Keeping the shell mounted
  // across these routes preserves live actor selection and refresh state.
  { path: '*', element: <AppShell /> },
])
