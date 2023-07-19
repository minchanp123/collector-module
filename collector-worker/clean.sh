#!/bin/bash

Cnt=`ps -ef|grep "chrome"|grep -v grep|wc -l`
PROCESS=`ps -ef|grep "chrome"|grep -v grep|awk '{print $2}'`
if [ $Cnt -ne 0 ]; then
	echo "Clean..."

	kill -9 $PROCESS

	echo "Clean Finished..."
else
	echo "Already Clean..."
fi

#!/bin/bash

Cnt=`ps -ef|grep "casper"|grep -v grep|wc -l`
PROCESS=`ps -ef|grep "casper"|grep -v grep|awk '{print $2}'`
if [ $Cnt -ne 0 ]; then
	echo "Clean..."

	kill -9 $PROCESS

	echo "Clean Finished..."
else
	echo "Already Clean..."
fi
