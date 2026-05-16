import { createContext, useContext } from 'react'

export const BookingContext = createContext(null)

export function useBookings() {
  return useContext(BookingContext)
}