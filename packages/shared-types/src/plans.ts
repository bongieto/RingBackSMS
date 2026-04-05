import { Plan } from './enums';

export interface PlanLimits {
  smsPerMonth: number;
  aiCallsPerMonth: number;
  overagePricePerSms: number; // in cents
  maxFlows: number;
  squareIntegration: boolean;
  posIntegration: boolean;
  calcomIntegration: boolean;
  slackNotifications: boolean;
  prioritySupport: boolean;
}

export const PLAN_LIMITS: Record<Plan, PlanLimits> = {
  [Plan.STARTER]: {
    smsPerMonth: 200,
    aiCallsPerMonth: 100,
    overagePricePerSms: 5, // $0.05
    maxFlows: 2,
    squareIntegration: false,
    posIntegration: false,
    calcomIntegration: false,
    slackNotifications: false,
    prioritySupport: false,
  },
  [Plan.GROWTH]: {
    smsPerMonth: 1000,
    aiCallsPerMonth: 500,
    overagePricePerSms: 4, // $0.04
    maxFlows: 5,
    squareIntegration: true,
    posIntegration: true,
    calcomIntegration: true,
    slackNotifications: true,
    prioritySupport: false,
  },
  [Plan.SCALE]: {
    smsPerMonth: 5000,
    aiCallsPerMonth: 2500,
    overagePricePerSms: 3, // $0.03
    maxFlows: 20,
    squareIntegration: true,
    posIntegration: true,
    calcomIntegration: true,
    slackNotifications: true,
    prioritySupport: true,
  },
  [Plan.ENTERPRISE]: {
    smsPerMonth: 999999,
    aiCallsPerMonth: 999999,
    overagePricePerSms: 2, // $0.02
    maxFlows: 999,
    squareIntegration: true,
    posIntegration: true,
    calcomIntegration: true,
    slackNotifications: true,
    prioritySupport: true,
  },
};
