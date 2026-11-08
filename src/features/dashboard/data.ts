import type { Role } from "@/features/auth/roles";
import type { GuestDay } from "@/features/guests/testData";
import type { NightSafety } from "@/features/handover/safety";
import type { StockItem } from "@/features/inventory/testData";
import type { WorkOrderView } from "@/features/maintenance/select";
import type { RunStatus } from "@/features/nightshift/useRun";
import type { RequestView } from "@/features/requests/select";
import type { RoomMoney } from "@/features/rooms/money";
import type { ShiftId, StaffMember } from "@/features/staff/testData";
import type { Night, RobotView, RoomView } from "./selectors";
import type { CallsState } from "./useReceptionCalls";

/**
 * Everything Oversikt knows, shaped once (useHotelData) and handed to the greeting, the figures,
 * every widget and the bell in the navigation.
 */
export type DashboardData = {
  role: Role;
  /** The person logged in, for the greeting; null without a session. */
  userName: string | null;
  /** The Oslo hour now, so the greeting is honest about the time of day. */
  hour: number;
  loading: boolean;
  /** Where the night's load stands: a failed or empty night is not "still loading". */
  nightStatus: RunStatus;
  night: Night | null;
  rooms: RoomView[] | null;
  /** What can hurt a guest, from the run log (unsigned wet floors, the stranger); null until the night is in. */
  safety: NightSafety | null;
  /** The room check's money and the one Klare til salg figure (rooms/money.ts); moves when a room is released. */
  money: RoomMoney | null;
  robot: RobotView | null;
  requests: RequestView[];
  maintenance: WorkOrderView[];
  outOfOrder: string[];
  guests: GuestDay;
  calls: CallsState;
  /** Fetch the calls again (the Resepsjon widget's Prøv igjen; the bell reads the same calls). */
  retryCalls: () => void;
  /** Every stock line, and the ones under minimum. */
  stock: readonly StockItem[];
  lowStock: StockItem[];
  /** The guests' average rating and how many ratings it is made of. */
  reviews: { average: number; count: number } | null;
  shift: ShiftId;
  onShift: StaffMember[];
};
