const util = require('util');
const { Kafka } = require('kafkajs');

const kafka = new Kafka({
    clientId: 'my-app',
    brokers: ['kafka-test-2:9092']
});

const admin = kafka.admin();

const run = async () => {
    await admin.connect();
    console.log(await admin.describeCluster());
    console.log(util.inspect(await admin.fetchTopicMetadata(), { depth: Infinity, colors: true }));
    await admin.createPartitions({
        // validateOnly: <boolean>,
        // timeout: <Number>,
        topicPartitions: [
            {
                topic: 'test-topic',
                count: 2,
            }
        ],
    });
    await admin.disconnect();
};

run().catch(err => {
    console.log('Known error.');
    console.error(err);
    admin.disconnect();
});
