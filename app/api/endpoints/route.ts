import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { encrypt } from '@/lib/crypto';

// GET /api/endpoints
export async function GET() {
  try {
    const endpoints = await prisma.mcpEndpoint.findMany({
      where: {
        user_id: 'default_user',
      },
      include: {
        services: true,
      },
      orderBy: {
        created_at: 'desc',
      },
    });

    return NextResponse.json(endpoints);
  } catch (error: any) {
    console.error('[GET /api/endpoints] Error:', error);

    return NextResponse.json(
      {
        error: 'Failed to fetch endpoints',
        details: error.message,
      },
      {
        status: 500,
      }
    );
  }
}

// POST /api/endpoints
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { name, services } = body;

    if (
      !name ||
      !services ||
      !Array.isArray(services) ||
      services.length === 0
    ) {
      return NextResponse.json(
        {
          error: 'Name and services are required',
        },
        {
          status: 400,
        }
      );
    }

    if (
      !process.env.ENCRYPTION_MASTER_KEY ||
      process.env.ENCRYPTION_MASTER_KEY.length !== 32
    ) {
      console.error(
        '[POST] ENCRYPTION_MASTER_KEY invalid'
      );

      return NextResponse.json(
        {
          error:
            'Server encryption key missing or invalid',
        },
        {
          status: 500,
        }
      );
    }

    const encryptedServices = services.map(
      (svc: any) => {
        const configJson = JSON.stringify(
          svc.config
        );

        const {
          iv,
          tag,
          encryptedData,
        } = encrypt(configJson);

        return {
          service_type: svc.type,
          encrypted_config: encryptedData,
          iv,
          tag,
        };
      }
    );

    const endpoint =
      await prisma.mcpEndpoint.create({
        data: {
          name,
          user_id: 'default_user',
          services: {
            create: encryptedServices,
          },
        },
        include: {
          services: true,
        },
      });

    return NextResponse.json(endpoint, {
      status: 201,
    });
  } catch (error: any) {
    console.error(
      '[POST /api/endpoints] Error:',
      error
    );

    return NextResponse.json(
      {
        error: 'Failed to create endpoint',
        details: error.message,
      },
      {
        status: 500,
      }
    );
  }
}

// DELETE /api/endpoints?id=ENDPOINT_ID
export async function DELETE(request: Request) {
  try {
    const url = new URL(request.url);
    const endpointId = url.searchParams.get('id');

    if (!endpointId) {
      return NextResponse.json(
        {
          error: 'Endpoint ID is required',
        },
        {
          status: 400,
        }
      );
    }

    console.log(
      '[DELETE /api/endpoints] Request:',
      endpointId
    );

    // Pastikan endpoint memang milik user default
    const endpoint =
      await prisma.mcpEndpoint.findFirst({
        where: {
          id: endpointId,
          user_id: 'default_user',
        },
        include: {
          services: true,
        },
      });

    if (!endpoint) {
      return NextResponse.json(
        {
          error: 'Endpoint not found',
        },
        {
          status: 404,
        }
      );
    }

    // Hapus seluruh data yang bergantung pada endpoint
    await prisma.$transaction(async (tx) => {
      // Hapus execution logs
      await tx.executionLog.deleteMany({
        where: {
          endpoint_id: endpointId,
        },
      });

      // Hapus service credentials/config
      await tx.endpointService.deleteMany({
        where: {
          endpoint_id: endpointId,
        },
      });

      // Hapus endpoint
      await tx.mcpEndpoint.delete({
        where: {
          id: endpointId,
        },
      });
    });

    console.log(
      '[DELETE /api/endpoints] Deleted:',
      endpointId
    );

    return NextResponse.json({
      success: true,
      message: 'Endpoint deleted successfully',
      id: endpointId,
    });
  } catch (error: any) {
    console.error(
      '[DELETE /api/endpoints] Error:',
      error
    );

    return NextResponse.json(
      {
        error: 'Failed to delete endpoint',
        details: error.message,
      },
      {
        status: 500,
      }
    );
  }
}