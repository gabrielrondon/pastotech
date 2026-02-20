import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'
import { formatDistanceToNow, format } from 'date-fns'
import { ptBR } from 'date-fns/locale'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatRelativeTime(date: string | Date) {
  return formatDistanceToNow(new Date(date), { addSuffix: true, locale: ptBR })
}

export function formatDate(date: string | Date, pattern = 'dd/MM/yyyy') {
  return format(new Date(date), pattern, { locale: ptBR })
}

export function formatCurrency(cents: number, currency = 'BRL') {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency,
  }).format(cents / 100)
}

export function formatHectares(ha: number) {
  return `${ha.toLocaleString('pt-BR', { maximumFractionDigits: 2 })} ha`
}

export function animalAge(birthDate: string | undefined): string {
  if (!birthDate) return '—'
  const birth = new Date(birthDate)
  const now = new Date()
  const months = (now.getFullYear() - birth.getFullYear()) * 12 + now.getMonth() - birth.getMonth()
  if (months < 1) return 'Menos de 1 mês'
  if (months < 12) return `${months} ${months === 1 ? 'mês' : 'meses'}`
  const years = Math.floor(months / 12)
  const rem = months % 12
  if (rem === 0) return `${years} ${years === 1 ? 'ano' : 'anos'}`
  return `${years} ${years === 1 ? 'ano' : 'anos'} e ${rem} ${rem === 1 ? 'mês' : 'meses'}`
}

export function ugmStatus(ugmHa: number, limit?: number): 'ok' | 'warning' | 'danger' {
  if (!limit) return 'ok'
  const ratio = ugmHa / limit
  if (ratio >= 1) return 'danger'
  if (ratio >= 0.85) return 'warning'
  return 'ok'
}
