import { UserPayload } from "@/common/guards/auth.guard";
import { PrismaService } from "@/core/services/prisma/prisma.service";
import { HttpStatus, Injectable } from "@nestjs/common";
import { UpdateProfileDto } from "./dto/body.dto";
import { deleteFile } from "@/core/services/files/delete_file";
import { FileService } from "@/core/services/files/cloudinary.service";
import { ApiError } from "@/common/errors/api_error";

@Injectable()
export class ProfileService {
    constructor(
        private prisma: PrismaService,
        private fileService: FileService,
    ) {}

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

    async updateProfile(
        payload: UpdateProfileDto,
        user: UserPayload,
        file?: Express.Multer.File,
    ) {
        const currentUser = await this.prisma.user.findUnique({
            where: { id: user.id },
            select: { id: true, profileImage: true, userName: true },
        });

        if (!currentUser) {
            throw new ApiError(HttpStatus.NOT_FOUND, "User not found");
        }

        let profileImageUrl: string | undefined = undefined;

        if (file) {
            profileImageUrl = await this.fileService.uploadToCloudinary(
                file,
                "profiles",
            );
        } else {
            const rawImage = payload.profileImage || payload.avatar;
            if (rawImage) {
                if (
                    !rawImage.startsWith("http://") &&
                    !rawImage.startsWith("https://")
                ) {
                    profileImageUrl = await this.fileService.uploadToCloudinary(
                        rawImage,
                        "profiles",
                    );
                } else {
                    profileImageUrl = rawImage;
                }
            }
        }

        const updateData: { userName?: string; profileImage?: string } = {};
        const newName = payload.userName || payload.fullName || payload.name;
        if (newName) {
            updateData.userName = newName;
        }
        if (profileImageUrl !== undefined) {
            updateData.profileImage = profileImageUrl;
        }

        const updatedUser = await this.prisma.user.update({
            where: { id: user.id },
            data: updateData,
            select: {
                id: true,
                userName: true,
                email: true,
                role: true,
                status: true,
                profileImage: true,
            },
        });

        const phone = payload.phoneNumber || payload.phone;
        const presentAddress = payload.presentAddress;
        const permanentAddress = payload.permanentAddress;

        if (phone || presentAddress || permanentAddress) {
            await this.prisma.workerProfile.updateMany({
                where: { workerId: user.id },
                data: {
                    ...(phone && { phoneNumber: phone }),
                    ...(presentAddress && { presentAddress }),
                    ...(permanentAddress && { permanentAddress }),
                },
            });
        }

        // Delete previous avatar if replaced
        if (
            profileImageUrl &&
            currentUser.profileImage &&
            currentUser.profileImage !== profileImageUrl
        ) {
            if (currentUser.profileImage.includes("cloudinary.com")) {
                await this.fileService
                    .deleteFromCloudinary(currentUser.profileImage)
                    .catch(() => {});
            } else {
                await deleteFile(currentUser.profileImage).catch(() => {});
            }
        }

        return {
            message: "Profile updated successfully",
            data: updatedUser,
        };
    }
}

