import DefaultProvider from './DefaultProvider';

/**
 * @typedef {Object} InVesselConfig
 *
 * @property {Object<string, any>}               [services]
 * @property {Object<string, Factory>}           [factories]
 * @property {Object<string, ProviderInterface>} [providers]
 * @property {Object<string, string>}            [aliases]
 * @property {Object<string, boolean>}           [shared]
 * @property {boolean}                           [sharedByDefault]
 */

/**
 * A function that instantiates a service when called. It is responsible
 * for retrieving and injecting dependencies into the service instance.
 * It should be a pure function.
 *
 * @callback Factory
 *
 * @param {InVessel} container - Container instance, for retrieving
 *     dependencies only.
 *
 * @returns {any}
 */

/**
 * Interface for service providers.
 * 
 * @interface ProviderInterface
 */
/**
 * @name ProviderInterface#get
 * @type {Factory}
 */

/**
 * Main interface for registering and retrieving dependencies.
 */
class InVessel {
    /**
     * @param {InVesselConfig} config
     */
    constructor (config) {
        /**
         * Services store. The container must not perform any operations on
         * values stored here.
         *
         * @name InVessel#services
         * @type {Map<string, any>}
         * @protected
         */
        this.services = new Map();

        /**
         * Aliases store. Values are stored here exactly as registered.
         *
         * @name InVessel#aliases
         * @type {Map<string, string>}
         * @protected
         */
        this.aliases = new Map();

        /**
         * Resolved aliases store. Maps aliases to keys that directly resolve
         * to services (final keys).
         *
         * @name InVessel#resolvedAliases
         * @type {Map<string, string>}
         * @protected
         */
        this.resolvedAliases = new Map();

        /**
         * Service providers store.
         *
         * @name InVessel#providers
         * @type {Map<string, ProviderInterface>}
         * @protected
         */
        this.providers = new Map();

        /**
         * Whether to assume entries are to be shared. Defaults to true.
         *
         * @name InVessel#sharedByDefault
         * @type {boolean}
         * @default true
         * @protected
         *
         * @see {@link InVessel#shared} for info on shared entries.
         */
        this.sharedByDefault = true;

        /**
         * Map of `key: flag` pairs. If flag is true, entry with given key will
         * be stored when first requested. Later requests will be served the
         * stored instance. Overrides {@link InVessel#sharedByDefault}.
         *
         * @name InVessel#shared
         * @type {Map<string, boolean>}
         * @protected
         */
        this.shared = new Map();

        /**
         * Whether the {@link InVessel#configure} method has been called.
         *
         * @name InVessel#configured
         * @type {boolean}
         * @protected
         */
        this.configured = false;

        this.configure(config);
    }

    /**
     * @param {InVesselConfig} [config]
     */
    configure (config = {}) {
        if (config.services) {
            for (const [key, service] of Object.entries(config.services)) {
                this.assertNoInstanceExists(key);
                this.services.set(key, service);
            }
        }

        if (config.factories) {
            for (const [key, factory] of Object.entries(config.factories)) {
                this.assertNoInstanceExists(key);
                const provider = new DefaultProvider(factory);
                this.providers.set(key, provider);
            }
        }

        if (config.providers) {
            for (const [key, provider] of Object.entries(config.providers)) {
                this.assertNoInstanceExists(key);
                this.providers.set(key, provider);
            }
        }

        if (config.aliases) {
            this.configureAliases(config.aliases);
        } else if (!this.configured && this.aliases.size > 0) {
            this.resolveAliases(this.aliases);
        }

        if (config.shared) {
            for (const [key, flag] of Object.entries(config.shared)) {
                this.shared.set(key, flag);
            }
        }

        if (typeof config.sharedByDefault !== "undefined") {
            this.sharedByDefault = config.sharedByDefault;
        }

        this.configured = true;
    }

    /**
     * Retrieves an entry from the container.
     *
     * @param {string} key - Key of the entry to retrieve.
     *
     * @returns {any}
     */
    get (key) {
        const requestedKey = key;

        if (this.services.has(requestedKey)) {
            return this.services.get(requestedKey);
        }

        key = this.resolvedAliases.has(key) ? this.resolvedAliases.get(key) : key;
        const isAlias = requestedKey !== key;

        const isKeyShared = this.shared.has(key)
            ? this.shared.get(key)
            : this.sharedByDefault;

        const isRequestedKeyShared = this.shared.has(requestedKey)
            ? this.shared.get(requestedKey)
            : this.sharedByDefault;

        if (isAlias && isRequestedKeyShared && this.services.has(key)) {
            const service = this.services.get(key);
            this.services.set(requestedKey, service);
            return service;
        }

        if (this.providers.has(key)) {
            const provider = this.providers.get(key);
            const instance = provider.get(this);

            if (isKeyShared) {
                this.services.set(key, instance);
            }

            if (isAlias && isRequestedKeyShared) {
                this.services.set(requestedKey, instance);
            }

            return instance;
        }

        throw Error(`Entry '${key}' not found.`);
    }

    /**
     * Check for the existence of an entry under the given key. Returns true
     * if found, false otherwise.
     *
     * @param {string} key - Key of the entry to query for.
     *
     * @returns {boolean}
     */
    has (key) {
        key = this.resolvedAliases.has(key) ? this.resolvedAliases.get(key) : key;
        let found = this.services.has(key) || this.providers.has(key);

        return found;
    }

    /**
     * Registers a service in the container. When retrieved, the exact same
     * instance will be returned. The service can be any value that needs to
     * be stored and retrieved unprocessed.
     *
     * @param {string} key - Key of the service for retrieval.
     * @param {any} instance - Value to be stored under this service.
     *
     * @returns {void}
     */
    service (key, instance) {
        this.configure({ services: { [key]: instance } });
    }

    /**
     * Registers a provider for the service in the container under given key.
     * When retrieved, the provider's get method return will be returned.
     *
     * @param {string} key - Entry key.
     * @param {ProviderInterface} provider - Object that will produce the service.
     */
    provider (key, provider) {
        this.configure({ providers: { [key]: provider } });
    }

    /**
     * Registers a factory for the service in the container under the given
     * key. Under the hood, a provider (DefaultProvider) for this service
     * will be created and its get method/property will be assigned the
     * factory.
     *
     * @param {string} key - Entry key.
     * @param {Factory} factory - Factory that will produce the service when called.
     */
    factory (key, factory) {
        this.configure({ factories: { [key]: factory } });
    }

    /**
     * Defines a key that will resolve to a service registered under the
     * target key.
     *
     * @param {string} alias
     * @param {string} target
     *
     * @todo Add alias resolution.
     */
    alias (alias, target) {
        this.configure({ aliases: { [alias]: target } });
    }

    /**
     * Sets a flag indicating the caching behavior for the given entry.
     * Using an alias will not affect the key it resolves to. This
     * configuration has no effect on services.
     *
     * @param {string} key - Entry key.
     * @param {boolean} flag - Whether the entry should be shared.
     */
    setShared (key, flag) {
        this.configure({ shared: { [key]: flag } });
    }

    /**
     * Returns the default entry caching behavior.
     *
     * @returns {boolean}
     */
    getSharedByDefault () {
        return this.sharedByDefault;
    }

    /**
     * Sets a flag indicating the default entry caching behavior.
     *
     * @param {boolean} flag - Whether entries should be shared.
     */
    setSharedByDefault (flag) {
        this.sharedByDefault = flag;
    }

    /**
     * Asserts no instance of the entry with given key exists. This always
     * fails for entries registered through the service method. For those
     * registered with the factory or provider methods, it fails if the entry
     * is shared and has been requested at least once (which means it was
     * cached).
     *
     * @param {string} key - Key of the entry to check.
     *
     * @protected
     *
     * @throws {Error} if the service exists.
     */
    assertNoInstanceExists (key) {
        if (this.services.has(key)) {
            throw new Error(`An instance of '${key}' entry already exists.`);
        }
    }

    /**
     * @param {Object<string, string>} aliases
     *
     * @protected
     */
    configureAliases (aliases) {
        const entries = Object.entries(aliases);

        if (!this.configured) {
            for (const [alias, target] of entries) {
                this.assertNoInstanceExists(alias);
                this.aliases.set(alias, target);
            }

            this.resolveAliases(this.aliases);
            return;
        }

        let intersecting = false;
        for (const [k] in entries) {
            if (k in aliases) {
                intersecting = true;
                break;
            }
        }

        for (const [alias, target] of entries) {
            this.assertNoInstanceExists(alias);
            this.aliases.set(alias, target);
        }

        if (intersecting) {
            this.resolveAliases(this.aliases);
            return;
        }

        this.resolveAliases(aliases);

        for (const [alias, target] of this.resolvedAliases.entries()) {
            if (target in aliases) {
                this.resolvedAliases.set(alias, this.resolvedAliases.get(target));
            }
        }
    }

    /**
     * Populates {@link InVessel#resolvedAliases} with `alias: finalKey`
     * pairs. Aliases from the argument are mapped to final keys on
     * {@link InVessel#aliases}.
     *
     * @param {(Object<string, string>|Map<string, string>)} aliases
     *
     * @protected
     */
    resolveAliases (aliases) {
        const keys = aliases instanceof Map
            ? aliases.keys()
            : Object.keys(aliases);

        for (const alias of keys) {
            const visited = new Map();
            let name = alias;

            while (this.aliases.has(name)) {
                if (visited.has(name)) {
                    throw new Error(`Cyclic alias '${name}'.`);
                }

                visited.set(name, true);
                name = this.aliases.get(name);
            }

            this.resolvedAliases.set(alias, name);
        }
    }
}

export default InVessel;