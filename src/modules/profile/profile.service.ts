import { UserPayload } from "@/common/guards/auth.guard";
import { PrismaService } from "@/core/services/prisma/prisma.service";
import { Injectable } from "@nestjs/common";
import { UpdateProfileDto } from "./dto/body.dto";
import { deleteFile } from "@/core/services/files/delete_file";

@Injectable()
export class ProfileService {
    constructor(private prisma: PrismaService) {}

    async getProfile(user: UserPayload) {
        const userProfile = await this.prisma.user.findUnique({
            where: {
                id: user.id,
            },
            select: {
                id: true,
                userName: true,
                email: true,
                role: true,
                status: true,
                profileImage: true,
                workerProfile: {
                    select: {
                        id: true,
                        projectId: true,
                        workerCategory: true,
                        phoneNumber: true,
                        presentAddress: true,
                        permanentAddress: true,
                        dailyRate: true,
                        outstandingAmount: true,
                        currentEarnings: true,
                        allTimeEarnings: true,
                        assignedAt: true,
                    },
                },
            },
        });

        return {
            message: "User profile fetched successfully",
            data: userProfile,
        };
    }

    async updateProfile(payload: UpdateProfileDto, user: UserPayload) {
        const currentUser = await this.prisma.user.findUnique({
            where: { id: user.id },
            select: { id: true, profileImage: true },
        });

        const updateData: { userName?: string; profileImage?: string } = {};
        if (payload.name) {
            updateData.userName = payload.name;
        }
        if (payload.avatar) {
            updateData.profileImage = payload.avatar;
        }

        await this.prisma.user.update({
            where: { id: user.id },
            data: updateData,
        });

        if (payload.phone) {
            await this.prisma.workerProfile.updateMany({
                where: { workerId: user.id },
                data: { phoneNumber: payload.phone },
            });
        }

        // Delete previous avatar if replaced
        if (payload.avatar && currentUser?.profileImage) {
            await deleteFile(currentUser.profileImage);
        }

        return {
            message: "Profile updated successfully",
        };
    }
}
