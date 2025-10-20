import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export const isDev = import.meta.env.MODE === 'development';
export const BASE_URL = isDev
  ? 'http://localhost:5173'
  : 'https://pdf-outliner.vercel.app';
