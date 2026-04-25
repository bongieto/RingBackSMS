import { Plan } from './enums';

export interface PlanLimits {
  smsPerMonth: number;
  aiCallsPerMonth: number;
  overagePricePerSms: number; // in cents
  maxFlows: number;
  maxPhoneNumbers: number;
  maxTeamMembers: number;
  squareIntegration: boolean;
  posIntegration: boolean;
  calcomIntegration: boolean;
  slackNotifications: boolean;
  prioritySupport: boolean;
  apiAccess: boolean;
  multiLocation: boolean;
}

const UNLIMITED = 999999;

export const PLAN_LIMITS: Record<Plan, PlanLimits> = {
  [Plan.FREE]: {
    smsPerMonth: 50,
    aiCallsPerMonth: 25,
    overagePricePerSms: 3, // $0.03
    maxFlows: 1, // FALLBACK only
    maxPhoneNumbers: 1,
    maxTeamMembers: 1,
    squareIntegration: false,
    posIntegration: false,
    calcomIntegration: false,
    slackNotifications: false,
    prioritySupport: false,
    apiAccess: false,
    multiLocation: false,
  },
  [Plan.PRO]: {
    smsPerMonth: 1000,
    aiCallsPerMonth: 500,
    overagePricePerSms: 3, // $0.03
    maxFlows: 5, // all flows
    maxPhoneNumbers: 1,
    maxTeamMembers: 3,
    squareIntegration: false,
    posIntegration: false,
    calcomIntegration: true,
    slackNotifications: true,
    prioritySupport: false,
    apiAccess: false,
    multiLocation: false,
  },
  [Plan.BUSINESS]: {
    smsPerMonth: 5000,
    aiCallsPerMonth: 2500,
    overagePricePerSms: 3, // $0.03
    maxFlows: 20, // all flows + custom
    maxPhoneNumbers: 3,
    maxTeamMembers: 10,
    squareIntegration: true,
    posIntegration: true,
    calcomIntegration: true,
    slackNotifications: true,
    prioritySupport: true,
    apiAccess: false,
    multiLocation: false,
  },
  [Plan.SCALE]: {
    smsPerMonth: 20000,
    aiCallsPerMonth: UNLIMITED,
    overagePricePerSms: 3, // $0.03
    maxFlows: UNLIMITED,
    maxPhoneNumbers: UNLIMITED,
    maxTeamMembers: UNLIMITED,
    squareIntegration: true,
    posIntegration: true,
    calcomIntegration: true,
    slackNotifications: true,
    prioritySupport: true,
    apiAccess: true,
    multiLocation: true,
  },
};
