# APISIX data plane image with the custom cache-normalizer plugin.
FROM apache/apisix:3.10.0-debian

# The APISIX image runs as the non-root "apisix" user, and APISIX persists a
# generated instance id back into config.yaml on first boot. Copy both files
# with the right ownership so they remain readable/writable.
COPY --chown=apisix:apisix custom-plugins/cache-normalizer.lua /usr/local/apisix/apisix/plugins/cache-normalizer.lua
COPY --chown=apisix:apisix config.yaml /usr/local/apisix/conf/config.yaml
