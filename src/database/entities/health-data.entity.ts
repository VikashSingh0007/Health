import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';

@Entity('user_health_data')
export class UserHealthData {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('uuid')
  user_id: string;

  @ManyToOne(() => User, (user) => user.healthData, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ type: 'int', default: 0 })
  steps: number;

  @Column({ type: 'int', nullable: true })
  heart_rate: number;

  @Column({ type: 'int', nullable: true })
  calories: number;

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  distance: number;

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  weight: number; // Weight in kg

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  height: number; // Height in meters

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  sleep_duration: number; // Sleep duration in hours

  @Column({ type: 'int', nullable: true })
  active_minutes: number; // Active minutes per day

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  speed: number; // Average speed in km/h

  @CreateDateColumn()
  fetched_at: Date;

  @Column({ type: 'date', default: () => 'CURRENT_DATE' })
  date: Date;
}

