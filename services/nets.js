const axios = require("axios");

const NETS_API_BASE = process.env.NETS_API_BASE || "https://sandbox.nets.openapipaas.com";
const DEFAULT_TXN_ID = "sandbox_nets|m|8ff8e5b6-d43e-4786-8ac5-7accf8c5bd9b";

const getCourseInitIdParam = () => {
  try {
    require.resolve("./../course_init_id");
    const module = require("../course_init_id");
    const courseInitId = module.courseInitId || (module.default && module.default.courseInitId);
    return courseInitId ? `${courseInitId}` : "";
  } catch (error) {
    return "";
  }
};

const requestQr = async ({ amount, txnId }) => {
  const requestBody = {
    txn_id: txnId || DEFAULT_TXN_ID,
    amt_in_dollars: amount,
    notify_mobile: 0
  };

  const response = await axios.post(
    `${NETS_API_BASE}/api/v1/common/payments/nets-qr/request`,
    requestBody,
    {
      headers: {
        "api-key": process.env.API_KEY,
        "project-id": process.env.PROJECT_ID
      }
    }
  );

  const qrData = response.data && response.data.result ? response.data.result.data : null;
  const courseInitId = getCourseInitIdParam();
  const txnRetrievalRef = qrData ? qrData.txn_retrieval_ref : null;
  const webhookUrl = txnRetrievalRef
    ? `${NETS_API_BASE}/api/v1/common/payments/nets/webhook?txn_retrieval_ref=${txnRetrievalRef}&course_init_id=${courseInitId}`
    : "";

  return {
    qrData,
    rawResponse: response.data,
    courseInitId,
    txnRetrievalRef,
    webhookUrl
  };
};

const queryStatus = async ({ txnRetrievalRef, frontendTimeoutStatus }) => {
  const response = await axios.post(
    `${NETS_API_BASE}/api/v1/common/payments/nets-qr/query`,
    { txn_retrieval_ref: txnRetrievalRef, frontend_timeout_status: frontendTimeoutStatus },
    {
      headers: {
        "api-key": process.env.API_KEY,
        "project-id": process.env.PROJECT_ID,
        "Content-Type": "application/json"
      }
    }
  );

  return response;
};

module.exports = { requestQr, queryStatus, getCourseInitIdParam };
