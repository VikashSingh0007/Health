import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from './entities/user.entity';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private usersRepository: Repository<User>,
  ) {}

  async findOrCreate(googleProfile: any): Promise<User> {
    const { id: google_id, emails, displayName: name, photos } = googleProfile;
    const email = emails[0].value;
    const picture = photos?.[0]?.value || null;

    let user = await this.usersRepository.findOne({
      where: { google_id },
    });

    if (!user) {
      user = await this.usersRepository.findOne({
        where: { email },
      });
    }

    if (!user) {
      user = this.usersRepository.create({
        google_id,
        email,
        name,
        picture,
      });
      user = await this.usersRepository.save(user);
    } else {
      // Update existing user
      user.name = name;
      user.picture = picture;
      await this.usersRepository.save(user);
    }

    return user;
  }

  async updateTokens(
    userId: string,
    accessToken: string,
    refreshToken?: string,
  ): Promise<void> {
    await this.usersRepository.update(userId, {
      access_token: accessToken,
      refresh_token: refreshToken,
    });
  }

  async findById(id: string): Promise<User> {
    return this.usersRepository.findOne({ where: { id } });
  }

  async findByGoogleId(googleId: string): Promise<User> {
    return this.usersRepository.findOne({ where: { google_id: googleId } });
  }

  async updateLocation(userId: string, location: string): Promise<User> {
    await this.usersRepository.update(userId, { location });
    return this.findById(userId);
  }

  async getUsersByLocation(location: string): Promise<User[]> {
    return this.usersRepository.find({
      where: { location },
    });
  }

  async getAllLocations(): Promise<string[]> {
    const users = await this.usersRepository.find({
      select: ['location'],
    });
    const locations = users
      .map((user) => user.location)
      .filter((loc) => loc != null && loc.trim() !== '');
    return [...new Set(locations)]; // Return unique locations
  }
}

