FROM hugomods/hugo:exts-0.153.4 AS build
WORKDIR /src
COPY . .
RUN hugo --minify

FROM scratch
COPY --from=build /src/public /public
