import { createFileRoute } from '@tanstack/react-router'
import { UsageScreen } from '../features/admin'

export const Route = createFileRoute('/admin/uso')({ component: UsageScreen })
