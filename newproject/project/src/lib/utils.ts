import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(coins: number) {
  const inr = coins / 100;
  return `₹${inr.toFixed(2)}`;
}

export function getTodayDateString() {
  return new Date().toISOString().split('T')[0];
}

export function getWeekString() {
  const d = new Date();
  const day = d.getDay(),
      diff = d.getDate() - day + (day === 0 ? -6 : 1); // adjust when day is sunday
  const monday = new Date(d.setDate(diff));
  return monday.toISOString().split('T')[0];
}

export function getMonthString() {
  const d = new Date();
  return `${d.getFullYear()}-${d.getMonth() + 1}`;
}
