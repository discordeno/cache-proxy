/**

DONE
1. let me tell if it should store in mem or in persistent cache
2. MAIN - let me tell what types of things i want ~ if i only want guilds, no point in having the others
3. let me specify the props i want to store
4. let me provide a function that runs before adding to cache to let me choose if a channel/guild/user/whatever should be cached or not (like if (shouldCache(channel)) cache.add())
5. probably add support for any persistent cache by having functions like "getFromPersistentCache", set etc. 
6. allow guild.channels, guild.roles
 */
import {
  BigString,
  Bot,
  Collection,
  User,
  Member,
  Guild,
  Role,
  Channel,
  Message,
  GuildToggles,
} from "discordeno";
import { setupCacheEdits } from "./setupCacheEdits";
import { setupCacheRemovals } from "./setupCacheRemovals";

export interface ProxyCacheProps<T extends ProxyCacheTypes> {
  cache: Bot["cache"] & {
    options: CreateProxyCacheOptions;
    guilds: {
      memory: Collection<bigint, T["guild"]>;
      get: (id: bigint) => Promise<T["guild"] | undefined>;
      set: (value: T["guild"]) => Promise<void>;
      delete: (id: bigint) => Promise<void>;
    };
    channels: {
      guildIDs: Collection<bigint, bigint>;
      memory: Collection<bigint, T["channel"]>;
      get: (id: bigint) => Promise<T["channel"] | undefined>;
      set: (value: T["channel"]) => Promise<void>;
      delete: (id: bigint) => Promise<void>;
    };
    roles: {
      guildIDs: Collection<bigint, bigint>;
      memory: Collection<bigint, T["role"]>;
      get: (id: bigint) => Promise<T["role"] | undefined>;
      set: (value: T["role"]) => Promise<void>;
      delete: (id: bigint) => Promise<void>;
    };
    members: {
      guildIDs: Collection<bigint, bigint>;
      memory: Collection<bigint, T["member"]>;
      get: (id: bigint) => Promise<T["member"] | undefined>;
      set: (value: T["member"]) => Promise<void>;
      delete: (id: bigint) => Promise<void>;
    };
    messages: {
      channelIDs: Collection<bigint, bigint>;
      memory: Collection<bigint, T["message"]>;
      get: (id: bigint) => Promise<T["message"] | undefined>;
      set: (value: T["message"]) => Promise<void>;
      delete: (id: bigint) => Promise<void>;
    };
    users: {
      memory: Collection<bigint, T["user"]>;
      get: (id: bigint) => Promise<T["user"] | undefined>;
      set: (value: T["user"]) => Promise<void>;
      delete: (id: bigint) => Promise<void>;
    };
  };
}

export type BotWithProxyCache<
  T extends ProxyCacheTypes,
  B extends Bot = Bot
> = Omit<B, "cache"> & ProxyCacheProps<T>;

export function createProxyCache<
  T extends ProxyCacheTypes,
  B extends Bot = Bot
>(rawBot: B, options: CreateProxyCacheOptions): BotWithProxyCache<T, B> {
  // @ts-ignore why is this failing?
  const bot = rawBot as BotWithProxyCache<T, B>;

  bot.enabledPlugins.add("PROXY_CACHE");

  bot.cache.options = options;

  if (!bot.cache.options.bulk) bot.cache.options.bulk = {};
  // If user did not provide a bulk remover
  if (!bot.cache.options.bulk.removeChannel) {
    bot.cache.options.bulk.removeChannel = async function (id) {
      // Remove from in memory as well
      bot.cache.messages.memory.forEach((message) => {
        if (message.channelId === id) bot.cache.messages.memory.delete(id);
        bot.cache.messages.channelIDs.delete(id);
      });

      bot.cache.channels.memory.delete(id);
    };
  }

  if (!bot.cache.options.bulk.removeRole) {
    bot.cache.options.bulk.removeRole = async function (id) {
      // Delete the role itself if it exists
      bot.cache.roles.memory.delete(id);

      const guildID = bot.cache.roles.guildIDs.get(id);
      if (guildID) {
        // Get the guild if its in cache
        const guild = bot.cache.guilds.memory.get(guildID);
        if (guild) {
          // if roles are stored inside the guild remove it
          guild.roles?.delete(id);
          // Each memwho has this role needs to be edited and the role id removed
          guild.members?.forEach((member: { roles: bigint[] }) => {
            if (member.roles?.includes(id))
              member.roles = member.roles.filter(
                (roleID: bigint) => roleID !== id
              );
          });
        }
      }

      bot.cache.roles.guildIDs.delete(id);

      // if members are stored outside guilds, then each member itself needs to remove the role id that was deleted.
      bot.cache.members.memory.forEach((member) => {
        if (member.roles?.includes(id))
          member.roles = member.roles.filter((roleID: bigint) => roleID !== id);
      });
    };
  }

  if (!bot.cache.options.bulk.removeMessages) {
    bot.cache.options.bulk.removeMessages = async function (ids) {
      const channelID = ids.find((id) => bot.cache.messages.channelIDs.get(id));
      if (channelID) {
        const guildID = bot.cache.channels.guildIDs.get(channelID);
        if (guildID) {
          const guild = bot.cache.guilds.memory.get(guildID);
          if (guild) {
            const channel = guild.channels.get(channelID);
            if (channel) for (const id of ids) channel.messages?.delete(id);
          }
        }

        const channel = bot.cache.channels.memory.get(channelID);
        if (channel) {
          for (const id of ids) channel.messages?.delete(id);
        }
      }

      for (const id of ids) {
        // delete directly from memory if stored separately.
        bot.cache.messages.memory.delete(id);
        bot.cache.messages.channelIDs.delete(id);
      }
    };
  }

  if (!bot.cache.options.bulk.removeGuild) {
    bot.cache.options.bulk.removeGuild = async function (id) {
      // Remove from memory
      bot.cache.guilds.memory.delete(id);

      // Remove any associated messages
      bot.cache.messages.memory.forEach((message) => {
        if (message.guildID === id) {
          bot.cache.messages.memory.delete(message.id);
          bot.cache.messages.channelIDs.delete(message.id);
        }
      });

      // Remove any associated channels
      bot.cache.channels.memory.forEach((channel) => {
        if (channel.guildID === id) {
          bot.cache.channels.memory.delete(channel.id);
          bot.cache.channels.guildIDs.delete(channel.id);
        }
      });

      // Remove any associated roles
      bot.cache.roles.memory.forEach((role) => {
        if (role.guildID === id) {
          bot.cache.roles.memory.delete(role.id);
          bot.cache.roles.guildIDs.delete(role.id);
        }
      });

      // Remove any associated members
      bot.cache.members.memory.forEach((member) => {
        if (member.guildID === id) {
          bot.cache.members.memory.delete(member.id);
          bot.cache.members.guildIDs.delete(member.id);
        }
      });
    };
  }

  bot.cache.guilds = {
    memory: new Collection<bigint, T["guild"]>(),
    get: async function (id: BigString): Promise<T["guild"] | undefined> {
      // Force into bigint form
      const guildID = BigInt(id);

      // If available in memory, use it.
      if (options.cacheInMemory.guilds && bot.cache.guilds.memory.has(guildID))
        return bot.cache.guilds.memory.get(guildID);
      // Otherwise try to get from non-memory cache
      if (!options.cacheOutsideMemory.guilds || !options.getItem) return;

      const stored = await options.getItem<T["guild"]>("guild", guildID);
      if (stored && options.cacheInMemory.guilds)
        bot.cache.guilds.memory.set(guildID, stored);
      return stored;
    },
    set: async function (guild: T["guild"]): Promise<void> {
      // Should this be cached or not?
      if (
        options.shouldCache?.guild &&
        !(await options.shouldCache.guild(guild))
      )
        return;
      // If user wants memory cache, we cache it
      if (options.cacheInMemory.guilds)
        bot.cache.guilds.memory.set(guild.id, guild);
      // If user wants non-memory cache, we cache it
      if (options.cacheOutsideMemory.guilds)
        if (options.addItem) await options.addItem("guild", guild);
    },
    delete: async function (id: BigString): Promise<void> {
      // Force id to bigint
      const guildID = BigInt(id);
      // Remove from memory
      bot.cache.guilds.memory.delete(guildID);
      // Remove from non-memory cache
      await options.bulk?.removeGuild?.(guildID);
    },
  };

  bot.cache.users = {
    memory: new Collection<bigint, T["user"]>(),
    get: async function (id: BigString): Promise<T["user"] | undefined> {
      // Force into bigint form
      const userID = BigInt(id);

      // If available in memory, use it.
      if (options.cacheInMemory.users && bot.cache.users.memory.has(userID))
        return bot.cache.users.memory.get(userID);
      // Otherwise try to get from non-memory cache
      if (!options.cacheOutsideMemory.users || !options.getItem) return;

      const stored = await options.getItem<T["user"]>("user", userID);
      if (stored && options.cacheInMemory.users)
        bot.cache.users.memory.set(userID, stored);
      return stored;
    },
    set: async function (user: T["user"]): Promise<void> {
      if (options.shouldCache?.user && !(await options.shouldCache.user(user)))
        return;

      // If user wants memory cache, we cache it
      if (options.cacheInMemory.users)
        bot.cache.users.memory.set(user.id, user);
      // If user wants non-memory cache, we cache it
      if (options.cacheOutsideMemory.users)
        if (options.addItem) await options.addItem("user", user);
    },
    delete: async function (id: BigString): Promise<void> {
      // Force id to bigint
      const userID = BigInt(id);
      // Remove from memory
      bot.cache.users.memory.delete(userID);
      // Remove from non-memory cache
      if (options.removeItem) await options.removeItem("user", userID);
    },
  };

  bot.cache.roles = {
    guildIDs: new Collection<bigint, bigint>(),
    memory: new Collection<bigint, T["role"]>(),
    get: async function (id: BigString): Promise<T["role"] | undefined> {
      // Force into bigint form
      const roleID = BigInt(id);

      // If available in memory, use it.
      if (options.cacheInMemory.roles) {
        // If guilds are cached, roles will be inside them
        if (options.cacheInMemory.guilds) {
          const guildID = bot.cache.roles.guildIDs.get(roleID);
          if (guildID) {
            const guild = bot.cache.guilds.memory.get(guildID);
            if (guild) return guild;
          }
        } else if (bot.cache.roles.memory.has(roleID)) {
          // Check if its in memory outside of guilds
          return bot.cache.roles.memory.get(roleID);
        }
      }

      // Otherwise try to get from non-memory cache
      if (!options.cacheOutsideMemory.roles || !options.getItem) return;

      const stored = await options.getItem<T["role"]>("role", roleID);
      if (stored && options.cacheInMemory.roles)
        bot.cache.roles.memory.set(roleID, stored);
      return stored;
    },
    set: async function (role: T["role"]): Promise<void> {
      if (options.shouldCache?.role && !(await options.shouldCache.role(role)))
        return;

      // If user wants memory cache, we cache it
      if (options.cacheInMemory.roles) {
        if (role.guildId) bot.cache.roles.guildIDs.set(role.id, role.guildId);

        if (options.cacheInMemory.guilds) {
          const guildID = bot.cache.roles.guildIDs.get(role.id);
          if (guildID) {
            const guild = bot.cache.guilds.memory.get(guildID);
            if (guild) guild.roles.set(role.id, role);
            else
              console.warn(
                `[CACHE] Can't cache role(${role.id}) since guild.roles is enabled but a guild (${guildID}) was not found`
              );
          } else
            console.warn(
              `[CACHE] Can't cache role(${role.id}) since guild.roles is enabled but a guild id was not found.`
            );
        } else bot.cache.roles.memory.set(role.id, role);
      }
      // If user wants non-memory cache, we cache it
      if (options.cacheOutsideMemory.roles)
        if (options.addItem) await options.addItem("role", role);
    },
    delete: async function (id: BigString): Promise<void> {
      // Force id to bigint
      const roleID = BigInt(id);
      // Remove from memory
      bot.cache.roles.memory.delete(roleID);
      bot.cache.guilds.memory
        .get(bot.cache.roles.guildIDs.get(roleID)!)
        ?.roles?.delete(roleID);
      bot.cache.roles.guildIDs.delete(roleID);
      // Remove from non-memory cache
      if (options.removeItem) await options.removeItem("role", roleID);
    },
  };

  bot.cache.members = {
    guildIDs: new Collection<bigint, bigint>(),
    memory: new Collection<bigint, T["member"]>(),
    get: async function (id: BigString): Promise<T["member"] | undefined> {
      // Force into bigint form
      const memberID = BigInt(id);

      // If available in memory, use it.
      if (options.cacheInMemory.members) {
        // If guilds are cached, members will be inside them
        if (options.cacheInMemory.guilds) {
          const guildID = bot.cache.members.guildIDs.get(memberID);
          if (guildID) {
            const guild = bot.cache.guilds.memory.get(guildID);
            if (guild) return guild;
          }
        } else if (bot.cache.members.memory.has(memberID)) {
          // Check if its in memory outside of guilds
          return bot.cache.members.memory.get(memberID);
        }
      }

      // Otherwise try to get from non-memory cache
      if (!options.cacheOutsideMemory.members || !options.getItem) return;

      const stored = await options.getItem<T["member"]>("member", memberID);
      if (stored && options.cacheInMemory.members)
        bot.cache.members.memory.set(memberID, stored);
      return stored;
    },
    set: async function (member: T["member"]): Promise<void> {
      if (
        options.shouldCache?.member &&
        !(await options.shouldCache.member(member))
      )
        return;

      // If user wants memory cache, we cache it
      if (options.cacheInMemory.members) {
        if (member.guildId)
          bot.cache.members.guildIDs.set(member.id, member.guildId);

        if (options.cacheInMemory.guilds) {
          const guildID = bot.cache.members.guildIDs.get(member.id);
          if (guildID) {
            const guild = bot.cache.guilds.memory.get(guildID);
            if (guild) guild.members.set(member.id, member);
            else
              console.warn(
                `[CACHE] Can't cache member(${member.id}) since guild.members is enabled but a guild (${guildID}) was not found`
              );
          } else
            console.warn(
              `[CACHE] Can't cache member(${member.id}) since guild.members is enabled but a guild id was not found.`
            );
        } else bot.cache.members.memory.set(member.id, member);
      }
      // If user wants non-memory cache, we cache it
      if (options.cacheOutsideMemory.members)
        if (options.addItem) await options.addItem("member", member);
    },
    delete: async function (id: BigString): Promise<void> {
      // Force id to bigint
      const memberID = BigInt(id);
      // Remove from memory
      bot.cache.members.memory.delete(memberID);
      bot.cache.guilds.memory
        .get(bot.cache.members.guildIDs.get(memberID)!)
        ?.members?.delete(memberID);
      bot.cache.members.guildIDs.delete(memberID);
      // Remove from non-memory cache
      if (options.removeItem) await options.removeItem("member", memberID);
    },
  };

  bot.cache.channels = {
    guildIDs: new Collection<bigint, bigint>(),
    memory: new Collection<bigint, T["channel"]>(),
    get: async function (id: BigString): Promise<T["channel"] | undefined> {
      // Force into bigint form
      const channelID = BigInt(id);

      // If available in memory, use it.
      if (options.cacheInMemory.channels) {
        // If guilds are cached, channels will be inside them
        if (options.cacheInMemory.guilds) {
          const guildID = bot.cache.channels.guildIDs.get(channelID);
          if (guildID) {
            const guild = bot.cache.guilds.memory.get(guildID);
            if (guild) return guild;
          }
        } else if (bot.cache.channels.memory.has(channelID)) {
          // Check if its in memory outside of guilds
          return bot.cache.channels.memory.get(channelID);
        }
      }

      // Otherwise try to get from non-memory cache
      if (!options.cacheOutsideMemory.channels || !options.getItem) return;

      const stored = await options.getItem<T["channel"]>("channel", channelID);
      if (stored && options.cacheInMemory.channels)
        bot.cache.channels.memory.set(channelID, stored);
      return stored;
    },
    set: async function (channel: T["channel"]): Promise<void> {
      if (
        options.shouldCache?.channel &&
        !(await options.shouldCache.channel(channel))
      )
        return;

      // If user wants memory cache, we cache it
      if (options.cacheInMemory.channels) {
        if (channel.guildId)
          bot.cache.channels.guildIDs.set(channel.id, channel.guildId);

        if (options.cacheInMemory.guilds) {
          const guildID = bot.cache.channels.guildIDs.get(channel.id);
          if (guildID) {
            const guild = bot.cache.guilds.memory.get(guildID);
            if (guild) guild.channels.set(channel.id, channel);
            else
              console.warn(
                `[CACHE] Can't cache channel(${channel.id}) since guild.channels is enabled but a guild (${guildID}) was not found`
              );
          } else
            console.warn(
              `[CACHE] Can't cache channel(${channel.id}) since guild.channels is enabled but a guild id was not found.`
            );
        } else bot.cache.channels.memory.set(channel.id, channel);
      }
      // If user wants non-memory cache, we cache it
      if (options.cacheOutsideMemory.channels)
        if (options.addItem) await options.addItem("channel", channel);
    },
    delete: async function (id: BigString): Promise<void> {
      // Force id to bigint
      const channelID = BigInt(id);
      // Remove from memory
      bot.cache.channels.memory.delete(channelID);
      bot.cache.guilds.memory
        .get(bot.cache.channels.guildIDs.get(channelID)!)
        ?.channels?.delete(channelID);
      bot.cache.channels.guildIDs.delete(channelID);
      // Remove from non-memory cache
      if (options.removeItem) await options.removeItem("channel", channelID);
    },
  };

  bot.cache.messages = {
    channelIDs: new Collection<bigint, bigint>(),
    memory: new Collection<bigint, T["message"]>(),
    get: async function (id: BigString): Promise<T["message"] | undefined> {
      // Force into bigint form
      const messageID = BigInt(id);

      // If available in memory, use it.
      if (options.cacheInMemory.messages) {
        // If guilds are cached, messages will be inside them
        if (options.cacheInMemory.guilds) {
          const guildID = bot.cache.messages.channelIDs.get(messageID);
          if (guildID) {
            const guild = bot.cache.guilds.memory.get(guildID);
            if (guild) return guild;
          }
        } else if (bot.cache.messages.memory.has(messageID)) {
          // Check if its in memory outside of guilds
          return bot.cache.messages.memory.get(messageID);
        }
      }

      // Otherwise try to get from non-memory cache
      if (!options.cacheOutsideMemory.messages || !options.getItem) return;

      const stored = await options.getItem<T["message"]>("message", messageID);
      if (stored && options.cacheInMemory.messages)
        bot.cache.messages.memory.set(messageID, stored);
      return stored;
    },
    set: async function (message: T["message"]): Promise<void> {
      if (
        options.shouldCache?.message &&
        !(await options.shouldCache.message(message))
      )
        return;

      // If user wants memory cache, we cache it
      if (options.cacheInMemory.messages) {
        if (options.cacheInMemory.guilds) {
          if (message.channelId)
            bot.cache.messages.channelIDs.set(message.id, message.channelId);

          const guildID = bot.cache.messages.channelIDs.get(message.id);
          if (guildID) {
            const guild = bot.cache.guilds.memory.get(guildID);
            if (guild) guild.messages.set(message.id, message);
            else
              console.warn(
                `[CACHE] Can't cache message(${message.id}) since guild.messages is enabled but a guild (${guildID}) was not found`
              );
          } else
            console.warn(
              `[CACHE] Can't cache message(${message.id}) since guild.messages is enabled but a guild id was not found.`
            );
        } else bot.cache.messages.memory.set(message.id, message);
      }
      // If user wants non-memory cache, we cache it
      if (options.cacheOutsideMemory.messages)
        if (options.addItem) await options.addItem("message", message);
    },
    delete: async function (id: BigString): Promise<void> {
      // Force id to bigint
      const messageID = BigInt(id);
      // Remove from memory
      bot.cache.messages.memory.delete(messageID);
      bot.cache.guilds.memory
        .get(bot.cache.messages.channelIDs.get(messageID)!)
        ?.messages?.delete(messageID);
      bot.cache.messages.channelIDs.delete(messageID);
      // Remove from non-memory cache
      if (options.removeItem) await options.removeItem("message", messageID);
    },
  };

  // MODIFY TRANSFORMERS
  const { user, role, member, guild, channel, message } = bot.transformers;

  bot.transformers.user = function (_, payload) {
    // Create the object from existing transformer.
    const old = user(bot, payload);

    // Filter to desired args
    const args: T["user"] = {};
    const keys = Object.keys(old) as (keyof User)[];

    for (const key of keys) {
      // ID prop is required. Desired props take priority.
      if (key === "id" || options.desiredProps?.users?.includes(key))
        args[key] = old[key];
      // If undesired we skip
      else if (options.undesiredProps?.users?.includes(key)) continue;
      // If user did not say this is undesired and did not provide any desired props we accept it
      else if (!options.desiredProps?.users?.length) args[key] = old[key];
    }

    // Add to memory
    bot.cache.users.set(args);

    return args;
  };

  bot.transformers.guild = function (_, payload) {
    // Get the guild id in bigint
    const guildId = bot.transformers.snowflake(payload.guild.id);
    // Make a raw guild object we can put in memory before running the old transformer which runs all the other transformers
    const preCacheGuild = {
      toggles: new GuildToggles(payload.guild),
      name: payload.guild.name,
      memberCount: payload.guild.member_count ?? 0,
      shardId: payload.shardId,
      icon: payload.guild.icon
        ? bot.utils.iconHashToBigInt(payload.guild.icon)
        : undefined,
      channels: new Collection<bigint, T["channel"]>(),
      roles: new Collection<bigint, T["role"]>(),
      id: guildId,
      // WEIRD EDGE CASE WITH BOT CREATED SERVERS
      ownerId: payload.guild.owner_id
        ? bot.transformers.snowflake(payload.guild.owner_id)
        : 0n,
      lastInteractedTime: Date.now(),
    };

    // CACHE DIRECT TO MEMORY BECAUSE OTHER TRANSFORMERS NEED THE GUILD IN CACHE
    bot.cache.guilds.memory.set(preCacheGuild.id, preCacheGuild);

    // Create the object from existing transformer.
    const old = guild(bot, payload);

    // Filter to desired args
    const args: T["guild"] = {};
    const keys = Object.keys(old) as (keyof Guild)[];

    for (const key of keys) {
      // ID is required. Desired props take priority.
      if (key === "id" || options.desiredProps?.guilds?.includes(key))
        args[key] = old[key];
      // If undesired we skip
      else if (options.undesiredProps?.guilds?.includes(key)) continue;
      // If guild did not say this is undesired and did not provide any desired props we accept it
      else if (!options.desiredProps?.guilds?.length) args[key] = old[key];
    }

    // Add to memory
    bot.cache.guilds.set(args);

    return args;
  };

  bot.transformers.channel = function (_, payload) {
    // Create the object from existing transformer.
    const old = channel(bot, payload);

    // Filter to desired args
    const args: T["channel"] = {};
    const keys = Object.keys(old) as (keyof Channel)[];

    for (const key of keys) {
      // ID is required. Desired props take priority.
      if (key === "id" || options.desiredProps?.channels?.includes(key))
        args[key] = old[key];
      // If undesired we skip
      else if (options.undesiredProps?.channels?.includes(key)) continue;
      // If channel did not say this is undesired and did not provide any desired props we accept it
      else if (!options.desiredProps?.channels?.length) args[key] = old[key];
    }

    // Add to memory
    bot.cache.channels.set(args);

    return args;
  };

  bot.transformers.member = function (_, payload, guildId, userId) {
    // Create the object from existing transformer.
    const old = member(bot, payload, guildId, userId);

    // Filter to desired args
    const args: T["member"] = {};
    const keys = Object.keys(old) as (keyof Member)[];

    for (const key of keys) {
      // ID is required. Desired props take priority.
      if (key === "id" || options.desiredProps?.members?.includes(key))
        args[key] = old[key];
      // If undesired we skip
      else if (options.undesiredProps?.members?.includes(key)) continue;
      // If member did not say this is undesired and did not provide any desired props we accept it
      else if (!options.desiredProps?.members?.length) args[key] = old[key];
    }

    // Add to memory
    bot.cache.members.set(args);

    return args;
  };

  bot.transformers.role = function (_, payload) {
    // Create the object from existing transformer.
    const old = role(bot, payload);

    // Filter to desired args
    const args: T["role"] = {};
    const keys = Object.keys(old) as (keyof Role)[];

    for (const key of keys) {
      // ID is required. Desired props take priority.
      if (key === "id" || options.desiredProps?.roles?.includes(key))
        args[key] = old[key];
      // If undesired we skip
      else if (options.undesiredProps?.roles?.includes(key)) continue;
      // If role did not say this is undesired and did not provide any desired props we accept it
      else if (!options.desiredProps?.roles?.length) args[key] = old[key];
    }

    // Add to memory
    bot.cache.roles.set(args);

    return args;
  };

  bot.transformers.message = function (_, payload) {
    // Create the object from existing transformer.
    const old = message(bot, payload);

    // Filter to desired args
    const args: T["message"] = {};
    const keys = Object.keys(old) as (keyof Message)[];

    for (const key of keys) {
      // ID is required. Desired props take priority.
      if (key === "id" || options.desiredProps?.messages?.includes(key))
        args[key] = old[key];
      // If undesired we skip
      else if (options.undesiredProps?.messages?.includes(key)) continue;
      // If message did not say this is undesired and did not provide any desired props we accept it
      else if (!options.desiredProps?.messages?.length) args[key] = old[key];
    }

    // Add to memory
    bot.cache.messages.set(args);

    return args;
  };

  setupCacheRemovals(bot);
  setupCacheEdits(bot);

  return bot;
}

export type ProxyCacheTypes = {
  guild: any;
  user: any;
  channel: any;
  member: any;
  role: any;
  message: any;
};

export interface CreateProxyCacheOptions {
  /** Configure the handlers that should be ran whenever something is about to be cached to determine whether it should or should not be cached. */
  shouldCache?: {
    /** Handler to check whether or not to cache this guild. */
    guild?: (guild: Guild) => Promise<boolean>;
    /** Handler to check whether or not to cache this user. */
    user?: (user: User) => Promise<boolean>;
    /** Handler to check whether or not to cache this channel. */
    channel?: (channel: Channel) => Promise<boolean>;
    /** Handler to check whether or not to cache this member. */
    member?: (member: Member) => Promise<boolean>;
    /** Handler to check whether or not to cache this role. */
    role?: (role: Role) => Promise<boolean>;
    /** Handler to check whether or not to cache this message. */
    message?: (message: Message) => Promise<boolean>;
  };
  /** Configure the exact properties you wish to have in each object. */
  desiredProps?: {
    /** The properties you want to keep in a user object. */
    users?: (keyof User)[];
    /** The properties you want to keep in a guild object. */
    guilds?: (keyof Guild)[];
    /** The properties you want to keep in a channel object. */
    channels?: (keyof Channel)[];
    /** The properties you want to keep in a member object. */
    members?: (keyof Member)[];
    /** The properties you want to keep in a role object. */
    roles?: (keyof Role)[];
    /** The properties you want to keep in a message object. */
    messages?: (keyof Message)[];
  };
  /** Configure the properties you do NOT want in each object. */
  undesiredProps?: {
    /** The properties you do NOT want in a user object. */
    users?: (keyof User)[];
    /** The properties you do NOT want in a guild object. */
    guilds?: (keyof Guild)[];
    /** The properties you do NOT want in a channel object. */
    channels?: (keyof Channel)[];
    /** The properties you do NOT want in a member object. */
    members?: (keyof Member)[];
    /** The properties you do NOT want in a role object. */
    roles?: (keyof Role)[];
    /** The properties you do NOT want in a message object. */
    messages?: (keyof Message)[];
  };
  /** Options to choose how the proxy will cache everything. */
  cacheInMemory: {
    /** Whether or not to cache guilds. */
    guilds: boolean;
    /** Whether or not to cache users. */
    users: boolean;
    /** Whether or not to cache channels. If guilds is enabled, then these are cached inside the guild object. */
    channels: boolean;
    /** Whether or not to cache members. If guilds is enabled, then these are cached inside the guild object. */
    members: boolean;
    /** Whether or not the cache roles. If guilds is enabled, then these are cached inside the guild object.*/
    roles: boolean;
    /** Whether or not the cache messages. If channels is enabled, then these are cached inside the channel object.*/
    messages: boolean;
  };
  /** Options to choose how the proxy will cache in a separate persitant cache. */
  cacheOutsideMemory: {
    /** Whether or not to cache guilds. */
    guilds: boolean;
    /** Whether or not to cache users. */
    users: boolean;
    /** Whether or not to cache channels. */
    channels: boolean;
    /** Whether or not to cache members. */
    members: boolean;
    /** Whether or not to cache roles. */
    roles: boolean;
    /** Whether or not to cache messages. */
    messages: boolean;
  };
  /** Handler to get an object from a specific table. */
  getItem?: <T>(
    table: "guild" | "channel" | "role" | "member" | "message" | "user",
    id: bigint
  ) => Promise<T>;
  /** Handler to set an object in a specific table. */
  addItem?: (
    table: "guild" | "channel" | "role" | "member" | "message" | "user",
    item: any
  ) => Promise<unknown>;
  /** Handler to delete an object in a specific table. */
  removeItem?: (
    table: "guild" | "channel" | "role" | "member" | "message" | "user",
    id: bigint
  ) => Promise<unknown>;
  bulk?: {
    /** Handler used to remove multiple objects in bulk. Instead of making hundreds of queries, you can optimize here using your preferred form. For example, when a guild is deleted, you want to make sure all channels, roles, messages and members are removed as well. */
    removeGuild?: (id: bigint) => Promise<unknown>;
    /** Handler used to remove multiple objects in bulk. Instead of making hundreds of queries, you can optimize here using your preferred form. For example, when a channel is deleted, you want to make sure all messages are removed as well. */
    removeChannel?: (id: bigint) => Promise<unknown>;
    /** Handler used to remove multiple objects in bulk. Instead of making hundreds of queries, you can optimize here using your preferred form. For example, when a role is deleted, you want to make sure all members who have this role are edited as well. */
    removeRole?: (id: bigint) => Promise<unknown>;
    /** Handler used to remove multiple messages. */
    removeMessages?: (ids: bigint[]) => Promise<unknown>;
  };
}

// const bot = createBot({ token: "" });
// const proxy = createProxyCache(bot, {
//   undesiredProps: {
//     users: ["email"],
//   },
//   cacheInMemory: {
//     guilds: true,
//     users: true,
//     channels: true,
//     members: true,
//     roles: true,
//   },
//   cacheOutsideMemory: {
//     guilds: true,
//     users: true,
//     channels: true,
//     members: true,
//     roles: true,
//   },
//   async getItem(table, id) {
//     return "" as unknown as any;
//   },
//   async addItem(table, item) {
//     return;
//   },
//   async removeItem(table, id) {
//     return;
//   },
// });

// await proxy.cache.guilds.get(0n);
