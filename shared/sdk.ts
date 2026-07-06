export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

export type PortalSdkMethod =
  | "auth.getToken"
  | "save.load"
  | "save.store"
  | "account.get"
  | "account.set"
  | "realtime.subscribe"
  | "realtime.emit";

export type SdkRequest = {
  type: "gamevault:sdk-request";
  requestId: string;
  gameId: string;
  method: PortalSdkMethod;
  payload?: JsonValue;
};

export type SdkResponse = {
  type: "gamevault:sdk-response";
  requestId: string;
  ok: boolean;
  result?: JsonValue;
  error?: string;
};

export type SdkEvent = {
  type: "gamevault:realtime-event";
  event: string;
  payload: JsonValue;
};

export type SavePayload = {
  schema_version: number;
  data: JsonValue;
};

export type AccountSetPayload = {
  key: string;
  schema_version: number;
  value: JsonValue;
};
