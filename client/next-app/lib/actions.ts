'use server'

import { cache } from 'react'

const server_url = process.env.SERVER_URL || 'https://server.typing-enhanced-eagle.workers.dev'

export const post = cache(async (url: string, data: any) => {
  const fullUrl = server_url + '/' + url

  const response = await fetch(fullUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(data),
    cache: 'no-store',
  })

  try {
    const json = await response.json()
    return json
  } catch (error) {
    console.error('JSON Error:', error)
    return {
      error: 'An error occurred',
    }
  }
})

export const get = cache(async (url: string) => {
  const fullUrl = server_url + '/' + url

  const response = await fetch(fullUrl, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
    },
    cache: 'no-store',
  })

  try {
    const json = await response.json()
    return json
  } catch (error) {
    console.error('Error:', error)
    return {
      error: 'An error occurred',
    }
  }
})
