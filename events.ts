import {
  Bot,
  Channel,
  EventHandlers,
  Guild,
  Member,
  Message,
  Role,
  User,
} from "discordeno";
import { BotWithProxyCache, ProxyCacheTypes } from ".";

export type Events = {
  [K in keyof EventHandlers]: EventHandlers[K] extends
    (bot: infer T, ...rest: infer R) => infer U
    ? Bot extends T ? (bot: Bot, ...rest: R) => U
    : (...rest: Parameters<EventHandlers[K]>) => U
    : never;
};

export interface BotWithProxyEvents extends Events {
  CHANNEL_UPDATE_WITH_OLD_CHANNEL(
    bot: BotWithProxyCache<ProxyCacheTypes, Bot>,
    oldChannel: Channel,
    newChannel: Channel,
  ): unknown;
  MESSAGE_UPDATE_WITH_OLD_MESSAGE(
    bot: BotWithProxyCache<ProxyCacheTypes, Bot>,
    oldChannel: Message,
    newChannel: Message,
  ): unknown;
  GUILD_UPDATE_WITH_OLD_GUILD(
    bot: BotWithProxyCache<ProxyCacheTypes, Bot>,
    oldChannel: Guild,
    newChannel: Guild,
  ): unknown;
  GUILD_ROLE_UPDATE_WITH_OLD_ROLE(
    bot: BotWithProxyCache<ProxyCacheTypes, Bot>,
    oldRole: Role,
    newRole: Role,
  ): unknown;
  GUILD_MEMBER_UPDATE_WITH_OLD_MEMBER(
    bot: BotWithProxyCache<ProxyCacheTypes, Bot>,
    oldMember: Member,
    newMember: Member,
  ): unknown;
  USER_UPDATE_WITH_OLD_USER(
    bot: BotWithProxyCache<ProxyCacheTypes, Bot>,
    oldUser: User,
    newUser: User,
  ): unknown;
}
