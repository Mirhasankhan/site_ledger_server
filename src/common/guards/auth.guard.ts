import {
    CanActivate,
    ExecutionContext,
    ForbiddenException,
    Injectable,
    UnauthorizedException,
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { Request } from "express";
import { Reflector } from "@nestjs/core";
import { IS_PUBLIC_KEY } from "@/common/decorators/auth.decorator";
import config from "@/config";
import { PrismaService } from "@/core/services/prisma/prisma.service";
import { UserRole, UserStatus } from "@prisma/client";
import { ROLES_KEY } from "../decorators/roles.decorator";

@Injectable()
export class AuthGuard implements CanActivate {
    constructor(
        private jwtService: JwtService,
        private reflector: Reflector,
        private prisma: PrismaService,
    ) {}

    async canActivate(context: ExecutionContext): Promise<boolean> {
        const isPublic = this.reflector.getAllAndOverride<boolean>(
            IS_PUBLIC_KEY,
            [context.getHandler(), context.getClass()],
        );

        const requiredRoles = this.reflector.getAllAndOverride<UserRole[]>(
            ROLES_KEY,
            [context.getHandler(), context.getClass()],
        );

        if (isPublic) {
            return true;
        }

        const request = context.switchToHttp().getRequest();
        const token = this.extractTokenFromHeader(request);

        if (!token) {
            throw new UnauthorizedException("Invalid Token");
        }

        let payload: any;
        try {
            payload = await this.jwtService.verifyAsync(token, {
                secret: config.jwt.jwt_secret,
            });
        } catch {
            throw new UnauthorizedException("Invalid token");
        }

        const user = await this.prisma.user.findUnique({
            where: {
                id: payload.id,
            },
            select: {
                id: true,
                email: true,
                role: true,
                status: true,
            },
        });

        if (!user || user.status === UserStatus.DELETED) {
            throw new UnauthorizedException("Unauthorized Request");
        }

        if (user.status === UserStatus.BLOCKED) {
            throw new UnauthorizedException("User is blocked");
        }

        if (user.status !== UserStatus.ACTIVE) {
            throw new UnauthorizedException("User is inactive");
        }

        if (requiredRoles && !requiredRoles.includes(user.role)) {
            throw new ForbiddenException("Insufficient permissions");
        }

        request["user"] = {
            id: user.id,
            email: user.email,
            role: user.role,
        };

        return true;
    }

    private extractTokenFromHeader(request: Request): string | undefined {
        const token = request.headers.authorization?.split(" ")[1];
        return token;
    }
}

export type UserPayload = {
    id: string;
    email: string;
    role: UserRole;
};
