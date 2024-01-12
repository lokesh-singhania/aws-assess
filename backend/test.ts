import { performance } from "perf_hooks";
import supertest from "supertest";
import { buildApp } from "./app";

const app = supertest(buildApp());

async function basicLatencyTest() {
    await app.post("/reset").expect(204);
    const start = performance.now();
    await app.post("/charge").expect(200);
    await app.post("/charge").expect(200);
    await app.post("/charge").expect(200);
    await app.post("/charge").expect(200);
    await app.post("/charge").expect(200);
    console.log(`Latency: ${performance.now() - start} ms`);
}

async function reproTest() {
    await app.post("/reset").expect(204);
    const charge=10
    const number=6
    const initial=100
    const expected = initial - number*charge
    const pmss=[]
    for(let i=1;i<number;i++){ // intentional number-1
        pmss.push(app.post("/charge"));
    }
    await Promise.allSettled(pmss);
    sleep(1000)   
    const response=await app.post("/charge")
    console.log(`Expected: ${expected}`)   
    console.log(`Actual: ${response.body.remainingBalance}`);
}

function sleep(ms:number) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function runTests() {
    await basicLatencyTest();
    await reproTest();
}

runTests().catch(console.error);
