const { Kafka } = require('kafkajs');

// Local K8s:
// const kafka = new Kafka({
//     clientId: 'my-app',
//     brokers: ['kafka-test-2:9092']
// });

// On confluent
const kafka = new Kafka({
    clientId: 'ros-api',
    brokers: ['pkc-e8mp5.eu-west-1.aws.confluent.cloud:9092'],
    ssl: true,
    sasl: {
        username: 'OE5MNS7SD2UGISK5',
        password: 'I6Pk02TPM70LbgmsdRM4TeedQT80V8xD3y1q5VNk19mhsXKr3m32S3ltreSiu0JP',
        mechanism: 'plain',
        
    }
});

const consumer = kafka.consumer({
    groupId: 'test-group',
    heartbeatInterval: 1000,
    sessionTimeout: 6000, // 5000 was too low for Confluent
});

const run = async () => {

    await consumer.connect();
    await consumer.subscribe({ topic: 'orders', fromBeginning: true });

    await consumer.run({
        eachMessage: async (payload) => {
            const { topic, partition, message } = payload;
            console.log({
                partition,
                offset: message.offset,
                key: message?.key?.toString(),
                value: message?.value?.toString(),
            })
        },
    })

}

process.on('SIGINT', () => {
    console.log('\nExiting cleanly...');
    consumer.disconnect().then(() => process.exit());
});

run().catch(err => {
    console.log('Known error.');
    console.error(err);
});
