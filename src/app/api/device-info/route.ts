import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  try {
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0] || 
               request.headers.get('x-real-ip') || 
               '127.0.0.1'

    let locationData = {
      city: 'Unknown',
      country: 'Unknown',
      countryCode: ''
    }

    if (ip && ip !== '127.0.0.1' && ip !== '::1') {
      try {
        const geoResponse = await fetch(`http://ip-api.com/json/${ip}?fields=status,city,country,countryCode`)
        const geoData = await geoResponse.json()
        
        if (geoData.status === 'success') {
          locationData = {
            city: geoData.city || 'Unknown',
            country: geoData.country || 'Unknown',
            countryCode: geoData.countryCode || ''
          }
        }
      } catch (geoError) {
        console.error('Geo lookup failed:', geoError)
      }
    }

    return NextResponse.json({
      ip,
      ...locationData
    })
  } catch (error) {
    console.error('Device info error:', error)
    return NextResponse.json({ 
      ip: 'Unknown',
      city: 'Unknown',
      country: 'Unknown',
      countryCode: ''
    })
  }
}
