import { NextRequest, NextResponse } from 'next/server'
import { verifyTideCloakToken } from '@tidecloak/nextjs/server'
import tcConfig from '../../../tidecloak.json'

const ALLOWED_ROLE = 'offline_access'

export async function GET(request: NextRequest): Promise<NextResponse> {
  const authHeader = request.headers.get('authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return NextResponse.json(
      { error: 'Unauthorized: Missing or invalid token' },
      { status: 401 }
    )
  }

  const token = authHeader.split(' ')[1]

  try {
    const user = await verifyTideCloakToken(tcConfig, token, [ALLOWED_ROLE])

    if (!user) {
      return NextResponse.json(
        { error: 'Forbidden: Invalid token or insufficient role' },
        { status: 403 }
      )
    }
    return NextResponse.json(
      { vuid: user.vuid, userkey: user.tideuserkey },
      { status: 200 }
    )
  } catch (err) {
    console.error('Token verification failed:', err)
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 }
    )
  }
}
