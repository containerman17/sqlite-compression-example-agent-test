#!/bin/bash

docker build -t sqlite-compression-example-agent-test .
docker run -it sqlite-compression-example-agent-test
